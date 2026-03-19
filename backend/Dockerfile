FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
RUN chmod +x /app/start-prod.sh

CMD ["sh", "/app/start-prod.sh"]
