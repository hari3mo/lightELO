import pandas as pd
import numpy as np
import os

GAMES_CSV_PATH = 'data/lichess_games.csv' # output from app/scripts/evaluate-games.mjs
OUTPUT_PATH = 'data/lichess_features.csv'

def create_player_features(game):
    evals = [float(x) if x else 0 for x in game['evals'].split(';')]
    clocks = [float(x) if x else 0 for x in game['clocks'].split(';')]

    start_time = float(game['time_control'].split('+')[0])
    increment = float(game['time_control'].split('+')[1])
    clocks = np.array(2 * [start_time] + clocks) # add initial clock times for both players
    time_spent = (clocks[:-2] - clocks[2:]) + increment # turn time = clock time before move - clock time after move (+increment)

    centipawns = np.array([0] + [1000 if eval > 10 else -1000 if eval < -10 
                  else eval * 100 for eval in evals]) # unit measuring how strong a position/move is; more positive = better for white/more negative = better for black
    diffs = np.diff(centipawns) # calculate change in centipawns after each turn (quantifies how good/bad a move was)

    white_cpl = np.maximum(0, -diffs[0::2]) # centipawn loss (positive values represent more loss)
    black_cpl = np.maximum(0, diffs[1::2])  

    w_time_spent = time_spent[0::2]
    b_time_spent = time_spent[1::2]

    w_shift_time = w_time_spent[np.abs(diffs[0::2]) > 100] # time spent on moves with significant change in centipawns 
    b_shift_time = b_time_spent[np.abs(diffs[1::2]) > 100]

    previous = centipawns[:-1]
    w_pre, b_pre = previous[0::2], previous[1::2]
 
    w_bal, w_win, w_los = np.abs(w_pre) < 100, w_pre >  300, w_pre < -300 # eval > 0 = winning for white
    b_bal, b_win, b_los = np.abs(b_pre) < 100, b_pre < -300, b_pre >  300 # eval < 0 = winning for black
 
    w_end = np.arange(len(white_cpl)) >= 30 # moves after 30 moves (endgame phase)
    b_end = np.arange(len(black_cpl)) >= 30

    return pd.Series({
        # Centipawn features
        'w_acpl': np.mean(white_cpl), # average centipawn loss
        'b_acpl': np.mean(black_cpl),
        'w_cpl_median': np.median(white_cpl), # median centipawn loss
        'b_cpl_median': np.median(black_cpl),
        'w_cpl_p75': np.percentile(white_cpl, 75), # 75th percentile of centipawn loss
        'b_cpl_p75': np.percentile(black_cpl, 75),
        'w_cpl_std': np.std(white_cpl), # standard deviation of centipawn loss
        'b_cpl_std': np.std(black_cpl),
        'eval_volatility': np.std(centipawns), # standard deviation of centipawns (quantifies how much the position fluctuated during the game)
        'w_best_move_rate': np.mean(white_cpl <= 5), # percentage of moves that were best move (cpl <= 5)
        'b_best_move_rate': np.mean(black_cpl <= 5),
        'w_acpl_balanced': np.mean(white_cpl[w_bal]), # average cpl on moves where player is in a balanced position (|eval| < 100)
        'w_acpl_winning': np.mean(white_cpl[w_win]),
        'w_acpl_losing': np.mean(white_cpl[w_los]),
        'b_acpl_balanced': np.mean(black_cpl[b_bal]),
        'b_acpl_winning': np.mean(black_cpl[b_win]),
        'b_acpl_losing': np.mean(black_cpl[b_los]),
        'w_n_balanced': int(w_bal.sum()), # number of moves where player is in a balanced position
        'w_n_winning': int(w_win.sum()), 
        'w_n_losing': int(w_los.sum()),
        'b_n_balanced': int(b_bal.sum()),
        'b_n_winning': int(b_win.sum()),
        'b_n_losing': int(b_los.sum()),
        'w_endgame_acpl': np.mean(white_cpl[w_end]), # average cpl in endgame phase
        'b_endgame_acpl': np.mean(black_cpl[b_end]),

        # Temporal features
        'w_avg_move_time': np.mean(w_time_spent),
        'b_avg_move_time': np.mean(b_time_spent),
        'w_time_trouble_moves': np.sum(clocks[0::2] < start_time * 0.1), # number of moves where player had less than 10% time left
        'b_time_trouble_moves': np.sum(clocks[1::2] < start_time * 0.1),
        'w_opening_speed': np.mean(w_time_spent[:5]), # average time spent on first 5 moves (opening phase of the game)
        'b_opening_speed': np.mean(b_time_spent[:5]),
        'w_shift_move_time': np.mean(w_shift_time) if len(w_shift_time) > 0 else 0, # average time spent on moves with significant change in centipawns
        'b_shift_move_time': np.mean(b_shift_time) if len(b_shift_time) > 0 else 0
    })

def format_df(games):
    df = pd.read_csv(games).sample(140_000, random_state=42)
    features_df = df.apply(create_player_features, axis=1)
    df = pd.concat([df, features_df], axis=1)
    df = df.dropna(subset=['w_acpl', 'b_acpl'])
    df[['w_shift_move_time', 'b_shift_move_time']] = \
        df[['w_shift_move_time', 'b_shift_move_time']].fillna(0)
    
    shared_cols = ['game_id', 'eco', 'ply_count', 'eval_volatility', 'category']
    independent_cols =  ['opening_speed', 'n_balanced', 'acpl', 'n_winning', 
                         'avg_move_time', 'n_losing', 'acpl_balanced', 
                         'cpl_p75', 'cpl_median', 'endgame_acpl', 
                         'time_trouble_moves', 'acpl_losing', 'cpl_std', 
                         'best_move_rate', 'shift_move_time', 'acpl_winning']

    white_cols = ['white_elo'] + [f'w_{c}' for c in independent_cols]
    white_df = df[shared_cols + white_cols].copy()
    white_df['is_white'] = 1
    white_df.columns = white_df.columns.str.replace('w_', '').str.replace('white_', '')
 
    black_cols = ['black_elo'] + [f'b_{c}' for c in independent_cols]
    black_df = df[shared_cols + black_cols].copy()
    black_df['is_white'] = 0
    black_df.columns = black_df.columns.str.replace('b_', '').str.replace('black_', '')

    features_df = pd.concat([white_df, black_df], ignore_index=True)
    features_df = features_df.sample(frac=1, random_state=42).reset_index(drop=True) # sample rows to shuffle dataset

    return features_df

def main():
    if not os.path.exists(OUTPUT_PATH):
        format_df(GAMES_CSV_PATH).to_csv(OUTPUT_PATH, index=False)
    else:
        print(f'{OUTPUT_PATH} already exists.')

if __name__ == "__main__":
    main()