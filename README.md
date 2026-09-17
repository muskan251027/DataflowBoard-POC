# Project Dashboard POC

A minimal React and Flask foundation for the project dashboard proof of concept.

## Start the backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

The health endpoint is available at `http://localhost:5000/api/health`.

## Start the frontend

```powershell
cd frontend
npm install
npm run dev
```