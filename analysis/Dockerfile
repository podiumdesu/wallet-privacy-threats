FROM python:3.11-slim

WORKDIR /work/analysis

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    findutils \
    grep \
    sed \
    && rm -rf /var/lib/apt/lists/*

COPY ./requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /work/analysis

RUN chmod +x /work/analysis/request-interceptor/run_experiment1.sh
RUN chmod +x /work/analysis/request-interceptor/run_analysis.sh
RUN chmod +x /work/analysis/request-interceptor/src/0-split.sh || true
RUN chmod +x /work/analysis/request-interceptor/src/1-split.sh || true

ENTRYPOINT ["/bin/bash"]