import zstandard as zstd
import pandas as pd
import chess.pgn
import time
import re
import io
import os

PGN_PATH = 'data/lichess_db_standard_rated_2026-01.pgn.zst' # archive of ~90 million raw PGN files from https://database.lichess.org/ (January 2026)
OUTPUT_PATH = 'data/lichess_games_raw.csv' # raw games (moves + clocks); evals are filled in locally by app/scripts/evaluate-games.mjs

ELO_RANGES = [ # track ELO distribution of extracted games
    ('800-', 0, 800),
    ('[800, 1100)', 800, 1100),
    ('[1100, 1400)', 1100, 1400),
    ('[1400, 1700)', 1400, 1700),
    ('[1700, 2000)', 1700, 2000),
    ('[2000, 2300)', 2000, 2300),
    ('2300+', 2300, 10_000)
]

TOTAL_GAMES = 1_000_000 # total number of games to extract
MAX_GAMES_PER_PLAYER = 5 # per-player cap to keep the sample diverse
TIME_CONTROL_FILTER = {'blitz', 'rapid', 'classical'} # filter out bullet and correspondence time controls (noisy)

EVAL_REGEX = re.compile(r'\[%eval (#?-?[\d.]+)\]') # captures either a centipawn eval ('0.34', -1.2') or a mate score ('#3', '#-5')
CLOCK_REGEX  = re.compile(r'\[%clk (\d+):(\d+):(\d+)\]') # captures hours, minutes, seconds as integers

CSV_COLUMNS = [
    'game_id', 'event', 'white', 'black', 'white_elo', 'black_elo',
    'white_rating_diff', 'black_rating_diff', 'white_title', 'black_title',
    'result', 'eco', 'opening', 'time_control', 'category', 'termination', 
    'utc_date', 'utc_time', 'ply_count', 'moves', 'evals', 'clocks'
]

# Extracts ELO range
def get_elo_range(elo):
    for label, low, high in ELO_RANGES:
        if low <= elo < high:
            return label

# Extracts time control category
def get_time_category(time_control_str):
    if time_control_str == '-':
        return None
    base, increment = time_control_str.split('+')
    total = int(base) + 40 * int(increment)
    if total < 180:   
        return 'bullet'
    if total < 480:   
        return 'blitz'
    if total < 1500:  
        return 'rapid'
    return 'classical'

# Extracts evaluation score
def get_evaluation_score(comment):
    match = EVAL_REGEX.search(comment)
    if not match:
        return None
    evaluation = match.group(1)
    if evaluation.startswith('#'):
        return 100.0 if int(evaluation[1:]) > 0 else -100.0
    return float(evaluation)

# Extracts clock time in seconds
def get_clock_time(comment):
    match = CLOCK_REGEX.search(comment)
    if not match:
        return None
    hours, minutes, seconds = [int(x) for x in match.groups()]
    return hours * 3600 + minutes * 60 + seconds

# Extracts game ID from lichess url
def get_game_id(url):
    return url.split('/')[-1]

# Extract game/PGN as a CSV row
def extract_row(game):
    headers = game.headers
    moves, evals, clocks = [], [], []
    node = game
    while node.variations:
        node = node.variation(0)
        moves.append(node.move.uci())
        evaluation = get_evaluation_score(node.comment)
        evals.append('' if evaluation is None else f'{evaluation:g}')
        clock = get_clock_time(node.comment)
        clocks.append('' if clock is None else str(clock))

    return {
        'game_id': get_game_id(headers.get('Site', '')),
        'event': headers.get('Event', ''),
        'white': headers.get('White', ''),
        'black': headers.get('Black', ''),
        'white_elo': headers.get('WhiteElo', ''),
        'black_elo': headers.get('BlackElo', ''),
        'white_rating_diff': headers.get('WhiteRatingDiff', ''),
        'black_rating_diff': headers.get('BlackRatingDiff', ''),
        'white_title': headers.get('WhiteTitle', ''),
        'black_title': headers.get('BlackTitle', ''),
        'result': headers.get('Result', ''),
        'eco': headers.get('ECO', ''),
        'opening': headers.get('Opening', ''),
        'time_control': headers.get('TimeControl', ''),
        'category': get_time_category(headers.get('TimeControl', '')),
        'termination': headers.get('Termination', ''),
        'utc_date': headers.get('UTCDate', ''),
        'utc_time': headers.get('UTCTime', ''),
        'ply_count': len(moves),
        'moves': ' '.join(moves),
        'evals': ';'.join(evals),
        'clocks': ';'.join(clocks)
    }

def filter_games(games):
    range_counts = {label: 0 for label, min_elo, max_elo in ELO_RANGES}
    player_counts = {}
    parsed_games = 0
    filtered_count = 0

    for game in games:
        if filtered_count >= TOTAL_GAMES or sum(range_counts.values()) >= TOTAL_GAMES:
            break
        parsed_games += 1
        headers = game.headers
        white_elo, black_elo = int(headers.get('WhiteElo', 0)), int(headers.get('BlackElo', 0))
        if not (white_elo and black_elo): # skip games with missing ELO info
            continue
        white_range, black_range = get_elo_range(white_elo), get_elo_range(black_elo)
        if white_range is None or black_range is None: # skip games with outside of ELO ranges
            continue
        time_control_str = headers.get('TimeControl', '')
        if get_time_category(time_control_str) not in TIME_CONTROL_FILTER: # skip games with unwanted time controls
            continue
        white_player, black_player = headers.get('White', ''), headers.get('Black', '')
        if player_counts.get(white_player, 0) >= MAX_GAMES_PER_PLAYER: # skip if already extracted 5 games from this player
            continue
        if player_counts.get(black_player, 0) >= MAX_GAMES_PER_PLAYER:
            continue
        first_move = game.next()
        if first_move is None: # skip empty games
            continue
        next_move = first_move.next()
        if next_move is None:
            continue
        base_time = int(time_control_str.split('+')[0])
        w_clock = get_clock_time(first_move.comment)
        b_clock = get_clock_time(next_move.comment)
        if w_clock is None or b_clock is None: # clocks are needed for time features; real-time games carry %clk
            continue
        if w_clock < (base_time * 0.6) or b_clock < (base_time * 0.6): # skip if 40% of base time reduced before first move ('Berserk' mode)
            continue
        
        range_counts[white_range] += 1
        player_counts[white_player] = player_counts.get(white_player, 0) + 1
        player_counts[black_player] = player_counts.get(black_player, 0) + 1
        
        filtered_count += 1
        yield game

        if filtered_count % 1_000 == 0: # print debug info every 1,000 games
            print(f"{time.strftime('%H:%M:%S')} - {filtered_count}/{parsed_games} games: {range_counts}")

# Sequentially read games from compressed pgn.zst file; too large to fit in memory (~30 gb)
# **Code from Gemini**
def stream_games():
    dctx = zstd.ZstdDecompressor(max_window_size=2**31)
    with open(PGN_PATH, "rb") as fh, dctx.stream_reader(fh) as reader:
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        game_text = []
        for line in text:
            game_text.append(line)
            if line.startswith("1. "):
                yield chess.pgn.read_game(io.StringIO("".join(game_text)))
                game_text.clear()

def main():
    if not os.path.exists(OUTPUT_PATH):
        rows = []
        chunk_size = 1_000
        
        print(f"Starting iterative extraction to {OUTPUT_PATH}...")
        for game in filter_games(stream_games()):
            rows.append(extract_row(game))
            
            # Periodically dump to disk to protect data and keep memory usage stable
            if len(rows) >= chunk_size:
                df = pd.DataFrame(rows, columns=CSV_COLUMNS)
                # Only write header if the file doesn't exist yet or is completely empty
                write_header = not os.path.exists(OUTPUT_PATH) or os.stat(OUTPUT_PATH).st_size == 0
                df.to_csv(OUTPUT_PATH, mode='a', index=False, header=write_header)
                rows.clear()
        
        # Write any trailing games that didn't perfectly align with the chunk size split
        if rows:
            df = pd.DataFrame(rows, columns=CSV_COLUMNS)
            write_header = not os.path.exists(OUTPUT_PATH) or os.stat(OUTPUT_PATH).st_size == 0
            df.to_csv(OUTPUT_PATH, mode='a', index=False, header=write_header)
            rows.clear()
            
        print("Extraction complete!")
    else:
        print(f'{OUTPUT_PATH} already exists.')

if __name__ == "__main__":
    main()