FROM python:3.12-slim
WORKDIR /agent
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY lumina_agent lumina_agent
COPY serve.py handler.py ./
EXPOSE 8790
CMD ["python", "-u", "serve.py"]
