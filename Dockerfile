FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Network diagnostic tools backing the NetLab allow-list.
# iputils-ping and traceroute use raw ICMP sockets: the image runs as root
# (Docker/ Render default) and Docker grants CAP_NET_RAW, so both work.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      iputils-ping \
      traceroute \
      iproute2 \
      net-tools \
      dnsutils \
      curl \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["sh", "-c", "gunicorn app:app --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:${PORT:-10000}"]
