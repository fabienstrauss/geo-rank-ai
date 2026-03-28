FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
RUN find /app/external_plugins -mindepth 1 -maxdepth 1 -type d -exec pip install --no-cache-dir -e {} \;
RUN chmod +x /app/start-prod.sh

CMD ["sh", "/app/start-prod.sh"]
