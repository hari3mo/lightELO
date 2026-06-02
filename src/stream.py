import zstandard as zstd
import chess.pgn
import time
import csv
import re
import io
import os

PGN_PATH = 'data/lichess_db_standard_rated_2026-01.pgn.zst'
# PGN_PATH = 'data/lichess_db_standard_rated_2025-12.pgn.zst'
OUTPUT_PATH = 'data/lichess_games_raw.csv'

ELO_RANGES = [
    ('800-', 0, 800),
    ('[800, 1100)', 800, 1100),
    ('[1100, 1400)', 1100, 1400),
    ('[1400, 1700)', 1400, 1700),
    ('[1700, 2000)', 1700, 2000),
    ('[2000, 2300]', 2000, 2300),
    ('2300+', 2300, 10_000)
]

TOTAL_GAMES = 1_000_000
TARGET_PER_RANGE = 100_000
MAX_GAMES_PER_PLAYER = 5
TIME_CONTROL_FILTER = {'blitz', 'rapid', 'classical'}

EVAL_REGEX = re.compile(r'\[%eval (#?-?[\d.]+)\]')
CLOCK_REGEX  = re.compile(r'\[%clk (\d+):(\d+):(\d+)\]')

CSV_COLUMNS = [
    'game_id', 'event', 'white', 'black', 'white_elo', 'black_elo',
    'white_rating_diff', 'black_rating_diff', 'white_title', 'black_title',
    'result', 'eco', 'opening', 'time_control', 'category', 'termination', 
    'utc_date', 'utc_time', 'ply_count', 'moves', 'evals', 'clocks'
]

def get_elo_range(elo):
    for label, low, high in ELO_RANGES:
        if low <= elo < high:
            return label
    return None

def get_time_category(time_control_str):
    if time_control_str == '-':
        return None
    try:
        base, increment = time_control_str.split('+')
        total = int(base) + 40 * int(increment)
        if total < 180:   return 'bullet'
        if total < 480:   return 'blitz'
        if total < 1500:  return 'rapid'
        return 'classical'
    except ValueError:
        return None

def get_evaluation_score(comment):
    match = EVAL_REGEX.search(comment)
    if not match:
        return None
    evaluation = match.group(1)
    if evaluation.startswith('#'):
        return 100.0 if int(evaluation[1:]) > 0 else -100.0
    return float(evaluation)

def get_clock_time(comment):
    match = CLOCK_REGEX.search(comment)
    if not match:
        return None
    hours, minutes, seconds = [int(x) for x in match.groups()]
    return hours * 3600 + minutes * 60 + seconds

def get_game_id(url):
    return url.split('/')[-1]

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

def stream_games():
    dctx = zstd.ZstdDecompressor(max_window_size=2**31)
    with open(PGN_PATH, "rb") as fh, dctx.stream_reader(fh) as reader:
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        game_text = []
        for line in text:
            game_text.append(line)
            if line.startswith("1. "):
                if "%eval" in line:
                    yield chess.pgn.read_game(io.StringIO("".join(game_text)))
                game_text.clear()

def filter_games(games):
    range_counts = {label: 0 for label, min_elo, max_elo in ELO_RANGES}
    player_counts = {}
    yielded_games = 0
    parsed_games = 0

    for game in games:
        if yielded_games >= TOTAL_GAMES:
            break
        parsed_games += 1
        headers = game.headers
        
        white_elo, black_elo = int(headers.get('WhiteElo', 0)), int(headers.get('BlackElo', 0))
        if not (white_elo and black_elo):
            continue
        
        white_range, black_range = get_elo_range(white_elo), get_elo_range(black_elo)
        if white_range is None or black_range is None:
            continue
            
        time_control_str = headers.get('TimeControl', '')
        if get_time_category(time_control_str) not in TIME_CONTROL_FILTER:
            continue
            
        white_player, black_player = headers.get('White', ''), headers.get('Black', '')
        if player_counts.get(white_player, 0) >= MAX_GAMES_PER_PLAYER or player_counts.get(black_player, 0) >= MAX_GAMES_PER_PLAYER:
            continue
            
        first_move = game.next()
        if first_move is None or '%eval' not in first_move.comment:
            continue
        next_move = first_move.next()
        if next_move is None:
            continue
            
        try:
            base_time = int(time_control_str.split('+')[0])
        except ValueError:
            continue
            
        w_clock = get_clock_time(first_move.comment)
        b_clock = get_clock_time(next_move.comment)
        
        # Adding None checks to ensure clock times were properly extracted
        if w_clock is None or b_clock is None or w_clock < (base_time * 0.6) or b_clock < (base_time * 0.6):
            continue
        
        # Track data and yield game
        range_counts[white_range] += 1
        player_counts[white_player] = player_counts.get(white_player, 0) + 1
        player_counts[black_player] = player_counts.get(black_player, 0) + 1
        yielded_games += 1

        if yielded_games % 1_000 == 0:
            print(f'{time.strftime("%H:%M:%S")} - {yielded_games}/{parsed_games} games processed: {range_counts}')
        yield game

def main():
    # Ensure data directory exists
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    if os.path.exists(OUTPUT_PATH):
        print(f'{OUTPUT_PATH} already exists. Please delete/rename it if you wish to run extraction again.')
        return

    with open(OUTPUT_PATH, "w", newline='', encoding="utf-8") as out_file:
        writer = csv.DictWriter(out_file, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        
        print("Streaming started. Press Ctrl+C to stop and keep saved data.")
        try:
            for game in filter_games(stream_games()):
                writer.writerow(extract_row(game))
        except KeyboardInterrupt:
            print("\nStream stopped by user. Progress safely written to disk.")
        except Exception as e:
            print(f"\nStream interrupted due to error: {e}")
        finally:
            print(f"Extraction halted. Data successfully saved to {OUTPUT_PATH}.")

if __name__ == "__main__":
    main()