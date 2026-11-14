#!/usr/bin/env bash
# Garmin-Anmeldung (Tokens in ~/.garminconnect) für den Zwischenspeicher von GitHub ver- und entschlüsseln.
#
# Warum: Das Repo ist öffentlich. Der Actions-Cache lässt sich von jedem Workflow-Lauf im Repo lesen, auch von
# einem freigegebenen Pull Request aus einem fremden Fork. Die Tokens geben Zugriff auf das Garmin-Konto,
# deshalb kommt nur eine verschlüsselte Datei in den Cache. Der Schlüssel ist ein GitHub-Secret
# (GARMIN_CACHE_KEY, sonst das Garmin-Passwort) – Secrets bekommt ein fremder Pull Request nie.
#
# Aufruf (.github/workflows/garmin.yml):
#   bash scripts/garmin_tokens.sh unpack   # ~/.garmin-tokens.enc → ~/.garminconnect (fehlt oder passt nicht: neu anmelden)
#   bash scripts/garmin_tokens.sh pack     # ~/.garminconnect → ~/.garmin-tokens.enc, meldet ready=true an GitHub
set -euo pipefail

DIR="${GARMIN_TOKEN_DIR:-$HOME/.garminconnect}"
ENC="${GARMIN_TOKENS_ENC:-$HOME/.garmin-tokens.enc}"
ITER=600000   # PBKDF2-Runden: macht das Durchprobieren von Schlüsseln teuer
export GARMIN_CACHE_KEY="${GARMIN_CACHE_KEY:-}"

case "${1:-}" in
  unpack)
    if [ ! -f "$ENC" ]; then echo "Kein verschlüsselter Garmin-Login im Zwischenspeicher."; exit 0; fi
    if [ -z "$GARMIN_CACHE_KEY" ]; then echo "Kein Schlüssel gesetzt – der Login wird nicht entschlüsselt."; exit 0; fi
    tmp="$(mktemp -d)"
    if openssl enc -d -aes-256-cbc -pbkdf2 -iter "$ITER" -pass env:GARMIN_CACHE_KEY -in "$ENC" 2>/dev/null \
        | tar -xzf - -C "$tmp" 2>/dev/null && [ -d "$tmp/tokens" ]; then
      rm -rf "$DIR"
      mkdir -p "$(dirname "$DIR")"
      mv "$tmp/tokens" "$DIR"
      chmod 700 "$DIR"
      echo "Garmin-Login entschlüsselt."
    else
      echo "Entschlüsseln fehlgeschlagen (Schlüssel geändert?) – es wird neu angemeldet."
    fi
    rm -rf "$tmp"
    ;;
  pack)
    if [ -z "$GARMIN_CACHE_KEY" ]; then echo "Kein Schlüssel gesetzt – der Login wird nicht gespeichert."; exit 0; fi
    if [ ! -d "$DIR" ] || [ -z "$(ls -A "$DIR" 2>/dev/null)" ]; then echo "Kein Garmin-Login vorhanden – nichts zu speichern."; exit 0; fi
    tmp="$(mktemp -d)"
    cp -a "$DIR" "$tmp/tokens"
    tar -czf - -C "$tmp" tokens \
      | openssl enc -aes-256-cbc -pbkdf2 -iter "$ITER" -salt -pass env:GARMIN_CACHE_KEY -out "$ENC"
    rm -rf "$tmp"
    chmod 600 "$ENC"
    echo "Garmin-Login verschlüsselt ($(wc -c < "$ENC") Bytes)."
    echo "ready=true" >> "${GITHUB_OUTPUT:-/dev/null}"
    ;;
  *)
    echo "Aufruf: bash scripts/garmin_tokens.sh unpack|pack" >&2
    exit 2
    ;;
esac
