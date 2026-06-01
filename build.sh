#!/usr/bin/env bash

pip install -r requirements.txt

curl -o stockfish https://tmpnn3qdc5xgd4kb.public.blob.vercel-storage.com/stockfish-ubuntu-x86-64-avx2

chmod +x stockfish