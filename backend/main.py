from fastapi import FastAPI

app = FastAPI(title="GeoRank AI Backend")

@app.get("/")
def read_root():
    return {"status:", "ok", "message:", "GeoRank API is running"}