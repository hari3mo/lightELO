from src.create_features import create_player_features
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from catboost import CatBoostRegressor
from pydantic import BaseModel
import pandas as pd
import os

MODEL_PATH = os.environ.get('MODEL_PATH', 'models/catboost.sav')
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
    model = CatBoostRegressor()
    model.load_model(MODEL_PATH)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://localhost:5173'],
    allow_methods=['*'],
    allow_headers=['*'],
)

class PredictRequest(BaseModel):
    evals: str
    clocks: str
    time_control: str = '600+0'
    eco: str = 'A00'

def category_from_time_control(tc: str) -> str:
    if not tc or tc == '-' or '+' not in tc:
        return 'rapid'
    try:
        base, inc = tc.split('+')
        total = int(base) + 40 * int(inc)
    except ValueError:
        return 'rapid'
    if total < 180:
        return 'bullet'
    if total < 480:
        return 'blitz'
    if total < 1500:
        return 'rapid'
    return 'classical'

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
    ply_count = len([e for e in req.evals.split(';') if e != ''])
    if ply_count < MIN_PLIES:
        raise HTTPException(status_code=400, detail=f'Need at least {MIN_PLIES} plies, got {ply_count}')

    # Formats flat time controls correctly before parsing rather than defaulting to 600+0
    tc = req.time_control
    if tc and tc not in ['-', '?']:
        if '+' not in tc:
            tc = f"{tc}+0"
    else:
        tc = '600+0'

    row = {
        'evals': req.evals,
        'clocks': req.clocks,
        'time_control': tc,
        'eco': req.eco or 'A00',
        'category': category_from_time_control(tc),
        'ply_count': ply_count,
    }
    feats = build_feature_frame(row)
    preds = model.predict(feats)
    return {
        'whiteElo': round(float(preds[0]), 1),
        'blackElo': round(float(preds[1]), 1),
        'plyCount': ply_count,
    }