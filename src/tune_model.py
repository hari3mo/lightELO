
from catboost import CatBoostRegressor, Pool
import pandas as pd
import optuna
import os

FEATURES_PATH = 'data/lichess_features.csv'
PARAMS_PATH = 'models/params/catboost.csv'
SEED = 42
N_TRIALS = 50
TUNE_ITERS = 2000

CAT_COLS = ['eco', 'category', 'is_white']
NUM_COLS = ['opening_speed', 'n_balanced', 'acpl', 'eval_volatility',
            'ply_count', 'n_winning', 'avg_move_time', 'n_losing',
            'acpl_balanced', 'cpl_p75', 'cpl_median', 'endgame_acpl',
            'time_trouble_moves', 'acpl_losing', 'cpl_std',
            'best_move_rate', 'acpl_winning',
            'opening_acpl', 'middlegame_acpl', 'awpl', 'blunders',
            'mistakes', 'inaccuracies', 'max_cpl']

FEATURES = NUM_COLS + CAT_COLS

def load_pools():
    df = pd.read_csv(FEATURES_PATH)
    for c in CAT_COLS:
        df[c] = df[c].astype('category')
    games = df['game_id'].drop_duplicates().sample(frac=1, random_state=SEED).values
    n = len(games)
    tr_ids = set(games[:int(.8 * n)])
    va_ids = set(games[int(.8 * n):int(.9 * n)])
    tr, va = df[df.game_id.isin(tr_ids)], df[df.game_id.isin(va_ids)]
    return (Pool(tr[FEATURES], tr['elo'], cat_features=CAT_COLS),
            Pool(va[FEATURES], va['elo'], cat_features=CAT_COLS))

def objective(trial, train_pool, val_pool):
    params = {
        'learning_rate': trial.suggest_float('learning_rate', 0.03, 0.3, log=True),
        'depth': trial.suggest_int('depth', 4, 10),
        'l2_leaf_reg': trial.suggest_float('l2_leaf_reg', 1.0, 50.0, log=True),
        'random_strength': trial.suggest_float('random_strength', 0.0, 10.0),
        'min_data_in_leaf': trial.suggest_int('min_data_in_leaf', 1, 100),
        'border_count': trial.suggest_int('border_count', 32, 255)}
    
    model = CatBoostRegressor(
        iterations=TUNE_ITERS,
        eval_metric='MAE',
        random_seed=SEED + trial.number,
        early_stopping_rounds=50,
        verbose=False,
        **params,)
    
    model.fit(train_pool, eval_set=val_pool)

    return model.get_best_score()['validation']['MAE']

def main():
    if not os.path.exists('models/params/catboost.csv'):
        train_pool, val_pool = load_pools()
        study = optuna.create_study(direction='minimize',
                                    sampler=optuna.samplers.TPESampler(seed=SEED))
        study.optimize(lambda t: objective(t, train_pool, val_pool),
                    n_trials=N_TRIALS, show_progress_bar=True)

        print(f'\nBest Validation MAE: {study.best_value:.2f}')
        print('Best Params:')
        for k, v in study.best_params.items():
            print(f'  {k}: {v}')

        pd.DataFrame([study.best_params]).to_csv(PARAMS_PATH, index=False)
        print(f'\nsaved: {PARAMS_PATH}')
    else:
        print(f'{PARAMS_PATH} already exists.')

if __name__ == '__main__':
    main()