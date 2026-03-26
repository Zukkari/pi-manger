# Build stage runs on native host and cross-compiles for arm64
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o api ./cmd/api

# Run stage is explicitly linux/arm64 (Raspberry Pi)
FROM --platform=linux/arm64 alpine:3.19
RUN adduser -D -u 1000 appuser
WORKDIR /app
COPY --from=builder /app/api .
EXPOSE 8080
USER appuser
CMD ["./api"]
