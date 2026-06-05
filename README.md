# lightElo

Predict a chess player's Elo rating from a single PGN. Engine-derived move-quality and time-usage features feed gradient-boosted tree regressors, benchmarked against a linear baseline. (COGS 109 final project — see [REPORT.md](REPORT.md).)

## Pipeline

1. **Extract** — stream-sample the Lichess Jan 2026 database (`src/extract_games.py`) → 140k games.
2. **Evaluate** — fill missing positions with Stockfish 17 via Node (`app/scripts/evaluate-games.mjs`).
3. **Features** — 27 predictors per player-game (`src/create_features.py`).
4. **Train + evaluate** — `src/train_model.py`, `src/evaluate_model.py`.

## Setup

```bash
pip install -r requirements.txt   # needs catboost, xgboost, lightgbm, scikit-learn
cd app && npm install             # for Stockfish evaluation step
```

## Run

```bash
python3 run.py --model xgboost    # one model
python3 run.py --all              # all four
python3 run.py --all --tune       # with Optuna tuning
```

Plots are written to `figures/`, trained models to `models/`.

## Results

Held-out test set (28k player-games). MAE/RMSE in Elo points.

| Model    | MAE    | RMSE   | R²     |
|----------|--------|--------|--------|
| XGBoost  | 223.96 | 279.68 | 0.4525 |
| CatBoost | 224.08 | 279.57 | 0.4529 |
| LightGBM | 224.66 | 280.79 | 0.4481 |
| Linear   | 241.38 | 299.79 | 0.3709 |

The GBDTs beat the linear baseline by ~17 MAE. Error is lowest mid-distribution (1200–1800) and grows at the tails (2400+ MAE ≈ 550), consistent with engine-feature saturation at high Elo.
