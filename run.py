from src import extract_games
from src import create_features
import subprocess
import time
import argparse
import sys
import os

EVAL_SCRIPT = os.path.join('app', 'scripts', 'evaluate-games.mjs')

def evaluate_games_node():
    subprocess.run(['node', EVAL_SCRIPT], check=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='catboost',
                        choices=['catboost', 'xgboost', 'lightgbm', 'linear'])
    parser.add_argument('--tune', action='store_true')
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()

    start_time = time.time()
    
    # Step 1: Process games and save to CSV
    print('[1/4] Extracting games...')
    extract_start = time.time()
    extract_games.main()
    print(f'Game extraction completed in {int(time.time() - extract_start)} seconds.')
    
    # Step 2: Evaluate positions locally with Stockfish (Node.js) 
    if not os.path.exists('data/lichess_games.csv'):
        print('[2/4] Evaluating games...')
        eval_start = time.time()
        evaluate_games_node()
        print(f'Game evaluation completed in {int(time.time() - eval_start)} seconds.')
    else:
        print('[2/4] Skipping evaluation (data/lichess_games.csv already exists).')
    
    # Step 3: Feature engineering
    print('[3/4] Creating features...')
    features_start = time.time()
    create_features.main()
    print(f'Feature creation completed in {int(time.time() - features_start)} seconds.')
       
    # Step 4: Model training & evaluation
    print('[4/4] Processing Models...')
    
    # Determine the target list of models
    models_to_run = ['catboost', 'xgboost', 'lightgbm', 'linear'] if args.all else [args.model]

    for model in models_to_run:
        print(f'\nProcessing {model.upper()}...')

        # 4a: Optional Tuning
        if args.tune:
            if model == 'linear':
                print(f'Skipping tuning: Linear Regression does not require hyperparameter tuning.')
            else:
                print(f'\nTuning {model}...')
                tune_start = time.time()
                subprocess.run([sys.executable, 'src/tune_model.py', '--model', model], check=True)
                print(f'{model} tuning completed in {int(time.time() - tune_start)} seconds.')

        # 4b: Training
        print(f'\nTraining {model}...')
        train_start = time.time()
        subprocess.run([sys.executable, 'src/train_model.py', '--model', model], check=True)
        print(f'{model} training completed in {int(time.time() - train_start)} seconds.')

        # Step 4c: Evaluation
        print(f'\nEvaluating {model}...')
        eval_start = time.time()
        subprocess.run([sys.executable, 'src/evaluate_model.py', '--model', model], check=True)
        print(f'{model} evaluation completed in {int(time.time() - eval_start)} seconds.')

    print(f'Pipeline completed in {int(time.time() - start_time)} seconds.')