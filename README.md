# hackkings

## Connecting voice → transcript → dataset in real time

The app can transcribe voice and analyze it; with the backend running, each analyzed call is **appended to `calls_dataset.csv`** so the dataset grows in real time.

1. **Install backend deps** (once):
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the backend** (in one terminal):
   ```bash
   python server.py
   ```
   Server runs at `http://localhost:5000`.

3. **Open the frontend** (e.g. open `index.html` in a browser, or use a local static server). The page is already configured to use `http://localhost:5000` as the API.

4. Use **Start mic** → speak → **Analyze**. Each time you click Analyze, the backend runs your extraction (`extraction.process_transcript`), appends one row to `calls_dataset.csv`, and returns issue/stance/summary for the UI.

If the backend is not running, the frontend falls back to the in-browser mock and does not update the CSV.