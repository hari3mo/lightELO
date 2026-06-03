import argparse
import os
import joblib
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from catboost import CatBoostRegressor
from xgboost import XGBRegressor


FEATURES_PATH = 'data/lichess_features.csv'
OUTPUT_DIR = 'figures'

def load_test_data(df):
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
    
    # Use the same 10% chronological split for test set as train_model.py
    te = set(games[int(n*0.9):])
    test_df = df[df['game_id'].isin(te)].copy()
    
    return test_df[features], test_df['elo'], test_df['game_id']

def load_model(model_type):
    model_path = f'models/{model_type}.sav'
    if model_type == 'catboost':
        model = CatBoostRegressor()
        model.load_model(model_path)
    elif model_type == 'xgboost':
        model = XGBRegressor()
        model.load_model(model_path.replace('.sav', '.json'))
    else: # lightgbm or linear
        model = joblib.load(model_path)
    return model

def evaluate(model_type):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df = pd.read_csv(FEATURES_PATH)
    X_te, y_te, game_ids = load_test_data(df)
    model = load_model(model_type)

    preds = model.predict(X_te)

    # 1. Overall Metrics
    mae = mean_absolute_error(y_te, preds)
    rmse = root_mean_squared_error(y_te, preds)
    r2 = r2_score(y_te, preds)

    print(f"MAE:  {mae:.2f}")
    print(f"RMSE: {rmse:.2f}")
    print(f"R²:   {r2:.4f}")

    # 2. DataFrame for Error Analysis
    results = pd.DataFrame({
        'Game_ID': game_ids, 
        'Actual_Elo': y_te, 
        'Predicted_Elo': preds
    })
    results['Error'] = np.abs(results['Actual_Elo'] - results['Predicted_Elo'])
    results['Residual'] = results['Predicted_Elo'] - results['Actual_Elo']

    # 3. Error by Elo Bracket
    print("\nError by Elo Bracket:")
    bins = [0, 1200, 1500, 1800, 2100, 2400, 3500]
    labels = ['1200-', '1200-1500', '1500-1800', '1800-2100', '2100-2400', '2400+']
    results['Elo_Bracket'] = pd.cut(results['Actual_Elo'], bins=bins, labels=labels)
    
    # Calculate MAE & Count per bracket
    bracket_stats = results.groupby('Elo_Bracket', observed=False)['Error'].agg(['mean', 'count']).dropna()
    bracket_stats.rename(columns={'mean': 'MAE', 'count': 'Games'}, inplace=True)
    print(bracket_stats.round(2).to_string())

    # 4. Visualizations
    plt.figure(figsize=(14, 5))
    
    # Plot A: Actual vs Predicted
    plt.subplot(1, 2, 1)
    plt.scatter(results['Actual_Elo'], results['Predicted_Elo'], alpha=0.3, color='#1f77b4', edgecolors='none', s=15)
    
    # Plot perfect prediction line
    min_val = min(results['Actual_Elo'].min(), results['Predicted_Elo'].min())
    max_val = max(results['Actual_Elo'].max(), results['Predicted_Elo'].max())
    plt.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2, label='Perfect Prediction')
    
    plt.xlabel('Actual Elo')
    plt.ylabel('Predicted Elo')
    plt.title(f'Actual vs. Predicted ({model_type.upper()})')
    plt.legend()

    # Plot B: Residuals Distribution
    plt.subplot(1, 2, 2)
    plt.hist(results['Residual'], bins=50, color='#2ca02c', alpha=0.7, edgecolor='black', linewidth=0.5)
    plt.axvline(0, color='red', linestyle='dashed', linewidth=2)
    plt.xlabel('Residual (Predicted - Actual)')
    plt.ylabel('Frequency')
    plt.title('Residual Distribution (Over/Under Prediction)')

    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, f'{model_type}_plots.png')
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"Exported evaluation plots to: {plot_path}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='catboost', 
                        choices=['catboost', 'xgboost', 'lightgbm', 'linear'])
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()

    if os.path.exists(FEATURES_PATH):
        if args.all:
            for model_type in ['catboost', 'xgboost', 'lightgbm', 'linear']:
                print(f"\nEvaluating {model_type}...")
                evaluate(model_type)
        else:
            evaluate(args.model)
    else:
        print(f"Error: {FEATURES_PATH} not found. Please run feature extraction first.")

if __name__ == "__main__":
    main()