from src import extract_games
from src import create_features
from src import train_model
import subprocess
import time
import sys
import os

EVAL_SCRIPT = os.path.join('app', 'scripts', 'evaluate-games.mjs')

def evaluate_games_node():
    subprocess.run(['node', EVAL_SCRIPT], check=True)

if __name__ == "__main__":
    args = sys.argv[1:]
    start_time = time.time()
    # Step 1: Process games and save to CSV
    print('Extracting games...')
    extract_start = time.time()
    extract_games.main()
    extract_end = time.time()
    print(f'Game extraction completed in {int(extract_end - extract_start)} seconds.')
    # Step 2: Evaluate positions locally with Stockfish (Node.js) 
    print('Evaluating games...')
    eval_start = time.time()
    evaluate_games_node()
    eval_end = time.time()
    print(f'Game evaluation completed in {int(eval_end - eval_start)} seconds.')
    # Step 3: Feature engineering
    print('Creating features...')
    features_start = time.time()
    create_features.main()
    features_end = time.time()
    print(f'Feature creation completed in {int(features_end - features_start)} seconds.')
    # Step 3: Model training (+ optional hyperparameter tuning)
    print('Training models...')
    train_start = time.time()
    if '--tune' in args:
        from src import tune_model
        tune_model.main()
    train_model.main()
    train_end = time.time()
    print(f'Model training completed in {int(train_end - train_start)} seconds.')
    # Step 4: Model evaluation
    ...
    end_time = time.time()
    print(f'Pipeline completed in {int(end_time - start_time)} seconds.')