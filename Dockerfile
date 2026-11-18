FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
ENV PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK CMD python3 -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/health'%os.environ['PORT'])"
CMD ["python3", "server.py"]
