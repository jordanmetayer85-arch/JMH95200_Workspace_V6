FROM node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The extracted application includes its existing pure-JavaScript dependencies.
COPY . /app
ENV NODE_ENV=production JMH_RUNTIME_ROOT=/data JMH_STORAGE_ROOT=/storage \
    JMH_NAS_STORAGE_ROOT=/storage \
    JMH_PORT=3000 JMH_SERVER_TYPE=nas JMH_FFMPEG_PATH=/usr/bin/ffmpeg
USER 3000:3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>{if(!j.ok||j.serverType!=='nas'||j.product!=='jmh95200-workspace-stable')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "nas-server.cjs"]
