from src.create_features import create_player_features
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from catboost import CatBoostRegressor
from pydantic import BaseModel
from dotenv import load_dotenv
import chess.engine
import pandas as pd
import logging
import chess
import os

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s : %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('lightElo')

PROD = os.environ.get('PROD', 'False').lower() == 'true'
if PROD:
    logger.info('Running in production mode.')
else:
    logger.info('Running in development mode.')

STOCKFISH_PATH = './stockfish'
MODEL_PATH = 'models/catboost.sav'
MIN_PLIES = 10

CAT_COLS = ['eco', 'category', 'is_white']
NUM_COLS = ['opening_speed', 'n_balanced', 'acpl', 'eval_volatility',
            'ply_count', 'n_winning', 'avg_move_time', 'n_losing',
            'acpl_balanced', 'cpl_p75', 'cpl_median', 'endgame_acpl',
            'time_trouble_moves', 'acpl_losing', 'cpl_std',
            'best_move_rate', 'shift_move_time', 'acpl_winning']
FEATURES = NUM_COLS + CAT_COLS
INDEPENDENT = ['opening_speed', 'n_balanced', 'acpl', 'n_winning',
               'avg_move_time', 'n_losing', 'acpl_balanced',
               'cpl_p75', 'cpl_median', 'endgame_acpl',
               'time_trouble_moves', 'acpl_losing', 'cpl_std',
               'best_move_rate', 'shift_move_time', 'acpl_winning']

model: CatBoostRegressor | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    logger.info('Initializing CatBoost Model...')
    model = CatBoostRegressor()
    model.load_model(MODEL_PATH)
    logger.info('Model loaded successfully.')
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

class PredictRequest(BaseModel):
    moves: str
    clocks: str
    time_control: str = '600+0'
    eco: str = 'A00'

def category_from_time_control(tc: str) -> str:
    if not tc or tc == '-' or '+' not in tc: return 'rapid'
    try:
        base, inc = tc.split('+')
        total = int(base) + 40 * int(inc)
    except ValueError:
        return 'rapid'
    if total < 180: return 'bullet'
    if total < 480: return 'blitz'
    if total < 1500: return 'rapid'
    return 'classical'

def generate_evals_from_moves(moves_str: str, depth: int = 12) -> str:
    board = chess.Board()
    moves = [m for m in moves_str.split() if m.strip()]
    evals = []
    
    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        engine.configure({'Threads': 1, 'Hash': 64})
        for move_san in moves:
            board.push_san(move_san)
            info = engine.analyse(board, chess.engine.Limit(depth=depth))
            score = info['score'].white()
            
            if score.is_mate():
                val = 100.0 if score.mate() > 0 else -100.0
                evals.append(f'{val:g}')
            else:
                cp_val = score.score() / 100.0
                evals.append(f'{cp_val:g}')
                
    return ';'.join(evals)

def build_feature_frame(row: dict) -> pd.DataFrame:
    feats = create_player_features(pd.Series(row))

    def player_row(prefix: str, is_white: int) -> dict:
        out = {
            'is_white': is_white,
            'eco': row['eco'],
            'category': row['category'],
            'ply_count': row['ply_count'],
            'eval_volatility': feats['eval_volatility'],
        }
        for c in INDEPENDENT:
            out[c] = feats[f'{prefix}_{c}']
        return out

    df = pd.DataFrame([player_row('w', 1), player_row('b', 0)])
    df = df[FEATURES]
    for c in CAT_COLS:
        df[c] = df[c].astype('category')
    return df

@app.get('/health')
def health():
    return {'ok': True}

@app.post('/predict')
def predict(req: PredictRequest):
    logger.info('=== NEW PREDICTION REQUEST ===')
    moves_list = [m for m in req.moves.split(' ') if m]
    ply_count = len(moves_list)
    logger.info(f'Parsed {ply_count} plies. ECO: {req.eco} | TC: {req.time_control}')
    
    if ply_count < MIN_PLIES:
        logger.warning(f'Rejected: Not enough moves ({ply_count}/{MIN_PLIES})')
        raise HTTPException(status_code=400, detail=f'Need at least {MIN_PLIES} moves to predict.')

    try:
        logger.info(f'Starting Stockfish Depth 12 evaluation...')
        evals_str = generate_evals_from_moves(req.moves)
        logger.info(f'Engine evaluation complete.')
    except FileNotFoundError:
        logger.error(f'Stockfish binary not found at path: {STOCKFISH_PATH}')
        raise HTTPException(status_code=500, detail='Server misconfiguration: Stockfish engine missing.')
    except Exception as e:
        logger.error(f'Engine failure: {str(e)}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'Engine evaluation failed: {str(e)}')

    tc = req.time_control if req.time_control and req.time_control not in ['-', '?'] else '600+0'
    if '+' not in tc: tc = f'{tc}+0'

    row = {
        'evals': evals_str,
        'clocks': req.clocks,
        'time_control': tc,
        'eco': req.eco or 'A00',
        'category': category_from_time_control(tc),
        'ply_count': ply_count,
    }
    
    try:
        logger.info('Extracting match features...')
        feats = build_feature_frame(row)
    except Exception as e:
        logger.error(f'Feature engineering crashed: {str(e)}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'Feature extraction failed: {str(e)}')

    try:
        logger.info('Running CatBoost inference...')
        preds = model.predict(feats)
        w_elo, b_elo = round(float(preds[0]), 1), round(float(preds[1]), 1)
        logger.info(f'SUCCESS: Predicted White {w_elo} | Black {b_elo}')
        return {'whiteElo': w_elo, 'blackElo': b_elo, 'plyCount': ply_count}
    except Exception as e:
        logger.error(f'Model prediction crashed: {str(e)}', exc_info=True)
        raise HTTPException(status_code=500, detail='CatBoost model prediction failed.')