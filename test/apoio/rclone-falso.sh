#!/usr/bin/env bash
# rclone de mentira para os testes: o remoto "gdrive:" vira a pasta $DRIVE_FALSO.
# FALHAR_REDE=1 simula queda de internet nos envios.
mapear () { case "$1" in gdrive:*) echo "$DRIVE_FALSO/${1#gdrive:}" ;; *:*) echo "remoto-desconhecido" ;; *) echo "$1" ;; esac; }
cmd="$1"; shift
pos=(); for a in "$@"; do case "$a" in --*) ;; *) pos+=("$a") ;; esac; done
case "$cmd" in
  version) echo "rclone v0-falso" ;;
  listremotes) echo "gdrive:" ;;
  copy)
    [ -n "$FALHAR_REDE" ] && { echo "Failed to copy: dial tcp: lookup www.googleapis.com: no such host" >&2; exit 1; }
    src=$(mapear "${pos[0]}"); dst=$(mapear "${pos[1]}")
    mkdir -p "$dst"
    if [ -d "$src" ]; then cp -R "$src"/. "$dst"/; else cp "$src" "$dst"/; fi ;;
  copyto)
    src=$(mapear "${pos[0]}"); dst=$(mapear "${pos[1]}")
    mkdir -p "$(dirname "$dst")"; cp "$src" "$dst" ;;
  lsf)
    dir=$(mapear "${pos[0]}")
    [ -d "$dir" ] || { echo "directory not found" >&2; exit 3; }
    ls -1 "$dir" ;;
  delete) echo "$@" >> "$DRIVE_FALSO/.apagados" ;;
  *) echo "comando desconhecido: $cmd" >&2; exit 1 ;;
esac
