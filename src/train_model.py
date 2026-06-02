from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from catboost import CatBoostRegressor, Pool
from lightgbm import LGBMRegressor
from xgboost import XGBRegressor
import pandas as pd
import argparse
import joblib
import os

FEATURES_PATH = 'data/lichess_features.csv'

def train(df, model_type='catboost'):
    cat_cols = ['eco', 'category', 'is_white']
    num_cols = ['opening_speed', 'n_balanced', 'acpl', 'eval_volatility',
                'ply_count', 'n_winning', 'avg_move_time', 'n_losing',
                'acpl_balanced', 'cpl_p75', 'cpl_median', 'endgame_acpl',
                'time_trouble_moves', 'acpl_losing', 'cpl_std',
                'best_move_rate', 'acpl_winning',
                'opening_acpl', 'middlegame_acpl', 'awpl', 'blunders',
                'mistakes', 'inaccuracies', 'max_cpl']
    
    features = num_cols + cat_cols
    for col in cat_cols:
        df[col] = df[col].astype('category')

    games = df['game_id'].drop_duplicates().values
    n = len(games)
    tr = set(games[:int(n*0.8)]) 
    va = set(games[int(n*0.8):int(n*0.9)]) 
    te = set(games[int(n*0.9):])
    
    train_df = df[df['game_id'].isin(tr)]
    val_df = df[df['game_id'].isin(va)]
    test_df = df[df['game_id'].isin(te)]

    X_tr, y_tr = train_df[features], train_df['elo']
    X_va, y_va = val_df[features], val_df['elo']
    X_te, y_te = test_df[features], test_df['elo']

    params_path = f'models/params/{model_type}.csv'
    output_path = f'models/{model_type}.sav'
    
    os.makedirs('models/params', exist_ok=True)

    # Load best hyperparameters if available (except for linear)
    best_params = {}
    if model_type != 'linear' and os.path.exists(params_path):
        best_params = pd.read_csv(params_path).iloc[0].to_dict()
        
        int_params = [
            'depth', 'max_depth', 'min_data_in_leaf', 
            'border_count', 'num_leaves', 'min_child_samples'
        ]
        for param in int_params:
            if param in best_params and not pd.isna(best_params[param]):
                best_params[param] = int(best_params[param])

    if model_type == 'catboost':
        train_pool = Pool(X_tr, y_tr, cat_features=cat_cols)
        val_pool = Pool(X_va, y_va, cat_features=cat_cols)
        model = CatBoostRegressor(iterations=3000, eval_metric='MAE', random_seed=42,
                                  early_stopping_rounds=100, **best_params)
        model.fit(train_pool, eval_set=val_pool, verbose=100)
        model.save_model(output_path)

    elif model_type == 'xgboost':
        model = XGBRegressor(n_estimators=3000, random_state=42, enable_categorical=True, 
                             tree_method='hist', early_stopping_rounds=100, eval_metric='mae',
                             **best_params)
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=100)
        model.save_model(output_path.replace('.sav', '.json'))

    elif model_type == 'lightgbm':
        model = LGBMRegressor(n_estimators=3000, random_state=42, verbose=-1, **best_params)
        
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], 
                  callbacks=[])
        joblib.dump(model, output_path)

    elif model_type == 'linear':
        num_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        cat_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore'))
        ])
        preprocessor = ColumnTransformer(transformers=[
            ('num', num_transformer, num_cols),
            ('cat', cat_transformer, cat_cols)
        ])
        model = Pipeline(steps=[('preprocessor', preprocessor),
                                ('regressor', LinearRegression())])
        model.fit(X_tr, y_tr)
        joblib.dump(model, output_path)

    # Feature Importance
    if model_type in ['catboost', 'xgboost', 'lightgbm']:
        print('\nFeature Importance:')
        if model_type == 'catboost':
            importances = model.get_feature_importance()
        elif model_type == 'xgboost':
            importances = model.feature_importances_
        elif model_type == 'lightgbm':
            importances = model.feature_importances_

        feature_imp = pd.DataFrame({'feature': features, 'importance': importances})
        print(feature_imp.sort_values('importance', ascending=False).head(10).to_string(index=False))

    def neg_rmse(est, X, y):
        return -root_mean_squared_error(y, est.predict(X))

    print('\nPermutation Importance (Sampled):')
    X_te_sample = X_te.sample(n=min(2000, len(X_te)), random_state=42)
    y_te_sample = y_te.loc[X_te_sample.index]
    
    r = permutation_importance(model, X_te_sample, y_te_sample, n_repeats=5,
                               scoring=neg_rmse, random_state=42, n_jobs=-1)
    perm = pd.DataFrame({'feature': X_te_sample.columns,
                         'delta_rmse': r.importances_mean,
                         'std': r.importances_std})
    print(perm.sort_values('delta_rmse', ascending=False).head(10).to_string(index=False))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='catboost', 
                        choices=['catboost', 'xgboost', 'lightgbm', 'linear'])
    args = parser.parse_args()

    if os.path.exists(FEATURES_PATH):
        train(pd.read_csv(FEATURES_PATH), model_type=args.model)
    else:
        print(f'{FEATURES_PATH} does not exist.')

if __name__ == "__main__":
    main()