import argparse
import pandas as pd
import optuna
import os

from sklearn.metrics import mean_absolute_error
from catboost import CatBoostRegressor, Pool
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

FEATURES_PATH = 'data/lichess_features.csv'
SEED = 42
N_TRIALS = 100
TUNE_ITERS = 1000

CAT_COLS = ['eco', 'category', 'is_white']
NUM_COLS = ['opening_speed', 'n_balanced', 'acpl', 'eval_volatility',
            'ply_count', 'n_winning', 'avg_move_time', 'n_losing',
            'acpl_balanced', 'cpl_p75', 'cpl_median', 'endgame_acpl',
            'time_trouble_moves', 'acpl_losing', 'cpl_std',
            'best_move_rate', 'acpl_winning',
            'opening_acpl', 'middlegame_acpl', 'awpl', 'blunders',
            'mistakes', 'inaccuracies', 'max_cpl']

FEATURES = NUM_COLS + CAT_COLS

def load_data():
    df = pd.read_csv(FEATURES_PATH)
    for c in CAT_COLS:
        df[c] = df[c].astype('category')
    games = df['game_id'].drop_duplicates().sample(frac=1, random_state=SEED).values
    n = len(games)
    tr_ids = set(games[:int(.8 * n)])
    va_ids = set(games[int(.8 * n):int(.9 * n)])
    tr, va = df[df.game_id.isin(tr_ids)], df[df.game_id.isin(va_ids)]
    
    return tr[FEATURES], tr['elo'], va[FEATURES], va['elo']

def objective_catboost(trial, X_tr, y_tr, X_va, y_va):
    params = {
        'learning_rate': trial.suggest_float('learning_rate', 0.03, 0.3, log=True),
        'depth': trial.suggest_int('depth', 4, 10),
        'l2_leaf_reg': trial.suggest_float('l2_leaf_reg', 1.0, 50.0, log=True),
        'random_strength': trial.suggest_float('random_strength', 0.0, 10.0),
        'min_data_in_leaf': trial.suggest_int('min_data_in_leaf', 1, 100)}
    
    train_pool = Pool(X_tr, y_tr, cat_features=CAT_COLS)
    val_pool = Pool(X_va, y_va, cat_features=CAT_COLS)
    
    model = CatBoostRegressor(iterations=TUNE_ITERS, eval_metric='MAE', random_seed=SEED,
                              early_stopping_rounds=50, verbose=False, **params)
    model.fit(train_pool, eval_set=val_pool)
    return model.get_best_score()['validation']['MAE']

def objective_xgboost(trial, X_tr, y_tr, X_va, y_va):
    params = {
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'subsample': trial.suggest_float('subsample', 0.5, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
        'gamma': trial.suggest_float('gamma', 0, 5)}
    
    model = XGBRegressor(n_estimators=TUNE_ITERS, random_state=SEED, enable_categorical=True,
                         tree_method='hist', early_stopping_rounds=50, eval_metric='mae', **params)
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)
    preds = model.predict(X_va)
    return mean_absolute_error(y_va, preds)

def objective_lightgbm(trial, X_tr, y_tr, X_va, y_va):
    params = {
        'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'num_leaves': trial.suggest_int('num_leaves', 20, 150),
        'max_depth': trial.suggest_int('max_depth', 3, 10),
        'min_child_samples': trial.suggest_int('min_child_samples', 10, 100),
        'subsample': trial.suggest_float('subsample', 0.5, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0)}
    
    model = LGBMRegressor(n_estimators=TUNE_ITERS, random_state=SEED, verbose=-1, **params)
    
    # LightGBM detects pandas categoricals automatically
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)]) 
    preds = model.predict(X_va)
    return mean_absolute_error(y_va, preds)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='catboost', 
                        choices=['catboost', 'xgboost', 'lightgbm'])
    args = parser.parse_args()

    params_path = f'models/params/{args.model}.csv'
    os.makedirs('models/params', exist_ok=True)

    if not os.path.exists(params_path):
        X_tr, y_tr, X_va, y_va = load_data()
        study = optuna.create_study(direction='minimize', sampler=optuna.samplers.TPESampler(seed=SEED))
        
        if args.model == 'catboost':
            study.optimize(lambda t: objective_catboost(t, X_tr, y_tr, X_va, y_va), 
                           n_trials=N_TRIALS, show_progress_bar=True)
        elif args.model == 'xgboost':
            study.optimize(lambda t: objective_xgboost(t, X_tr, y_tr, X_va, y_va), 
                           n_trials=N_TRIALS, show_progress_bar=True)
        elif args.model == 'lightgbm':
            study.optimize(lambda t: objective_lightgbm(t, X_tr, y_tr, X_va, y_va), 
                           n_trials=N_TRIALS, show_progress_bar=True)

        print(f'\nBest Validation MAE ({args.model}): {study.best_value:.2f}')
        print('Best Params:')
        for k, v in study.best_params.items():
            print(f'  {k}: {v}')

        pd.DataFrame([study.best_params]).to_csv(params_path, index=False)
        print(f'\nSaved: {params_path}')
    else:
        print(f'{params_path} already exists.')

if __name__ == '__main__':
    main()