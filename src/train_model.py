from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.inspection import permutation_importance
from catboost import CatBoostRegressor, Pool
import pandas as pd
import os

FEATURES_PATH = 'data/lichess_features.csv' # output from create_features.py
OUTPUT_PATH = 'models/catboost.sav' # export trained model
PARAMS_PATH = 'models/params/catboost.csv' # best hyperparameters from tuning

def train(df):
    cat_cols = ['eco', 'category', 'is_white']
    num_cols = ['opening_speed', 'n_balanced', 'acpl', 'eval_volatility',
                'ply_count', 'n_winning', 'avg_move_time', 'n_losing',
                'acpl_balanced', 'cpl_p75', 'cpl_median', 'endgame_acpl',
                'time_trouble_moves', 'acpl_losing', 'cpl_std',
                'best_move_rate', 'shift_move_time','acpl_winning',
                'opening_acpl', 'middlegame_acpl', 'awpl', 'blunders',
                'mistakes', 'inaccuracies', 'max_cpl', 'cpl_skew']
    
    features = num_cols + cat_cols
    for col in cat_cols:
        df[col] = df[col].astype('category')

    games = df['game_id'].drop_duplicates().values
    n = len(games)
    tr = set(games[:int(n*0.8)]) 
    va = set(games[int(n*0.8):int(n*0.9)]) 
    te = set(games[int(n*0.9):])
    
    # Split on game ID to avoid leakage between training and validation/test sets
    train_df = df[df['game_id'].isin(tr)]
    val_df = df[df['game_id'].isin(va)]
    test_df = df[df['game_id'].isin(te)]

    X_tr, y_tr = train_df[features], train_df['elo']
    X_va, y_va = val_df[features], val_df['elo']
    X_te, y_te = test_df[features], test_df['elo']

    # Train CatBoost model
    if os.path.exists(PARAMS_PATH):
        best_params = pd.read_csv(PARAMS_PATH).iloc[0].to_dict() # load best hyperparameters from tuning
    else:
        best_params = {} # use default hyperparameters
    train_pool = Pool(X_tr, y_tr, cat_features=cat_cols)
    val_pool = Pool(X_va, y_va, cat_features=cat_cols)
    model = CatBoostRegressor(iterations=3000,
                              eval_metric='MAE',
                              random_seed=42,
                              early_stopping_rounds=100,
                              **best_params)
    
    model.fit(train_pool,eval_set=val_pool, verbose=100)
    preds = model.predict(X_te)
    mae = mean_absolute_error(y_te, preds)
    rmse = root_mean_squared_error(y_te, preds)
    print(f'Test MAE: {mae:.2f}')
    print(f'Test RMSE: {rmse:.2f}')

    def neg_rmse(est, X, y):
        return -root_mean_squared_error(y, est.predict(X))

    print('\nFeature Importance:')
    feature_imp = pd.DataFrame({'feature': model.feature_names_, 
                                'importance': model.get_feature_importance()})
    print(feature_imp.sort_values('importance', ascending=False).to_string(index=False))

    print('\nPermutation Importance:')
    r = permutation_importance(model, X_te, y_te, n_repeats=5,
                            scoring=neg_rmse, random_state=42, n_jobs=1)
    perm = pd.DataFrame({'feature': X_te.columns,
                        'delta_rmse': r.importances_mean,
                        'std': r.importances_std})
    print(perm.sort_values('delta_rmse', ascending=False).to_string(index=False))

    model.save_model(OUTPUT_PATH)

def main():
    if not os.path.exists(OUTPUT_PATH):
        train(pd.read_csv(FEATURES_PATH))
    else:
        print(f'{OUTPUT_PATH} already exists.')

if __name__ == "__main__":
    main()
