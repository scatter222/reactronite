#!/usr/bin/env bash
# fix-root-display.sh — Diagnose and fix display/auth issues for running
# Electron apps as root (e.g. after dnf install).
#
# Usage:
#   sudo ./fix-root-display.sh          # diagnose + fix
#   sudo ./fix-root-display.sh --check  # diagnose only, no changes

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

DRY_RUN=false
[[ "${1:-}" == "--check" ]] && DRY_RUN=true

FIXES_APPLIED=0
PROBLEMS=0
WARNINGS=0

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; WARNINGS=$((WARNINGS + 1)); }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*"; PROBLEMS=$((PROBLEMS + 1)); }
fix()     { echo -e "${GREEN}[FIX]${RESET}   $*"; FIXES_APPLIED=$((FIXES_APPLIED + 1)); }
section() { echo; echo -e "${BOLD}━━━ $* ━━━${RESET}"; }

# --------------------------------------------------------------------------
# 0. Preamble
# --------------------------------------------------------------------------
section "Environment Overview"

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~${REAL_USER}")
REAL_UID=$(id -u "$REAL_USER" 2>/dev/null || echo "?")

info "Running as:        $(whoami) (uid=$(id -u))"
info "Real (invoking) user: ${REAL_USER} (uid=${REAL_UID}, home=${REAL_HOME})"
info "Hostname:          $(hostname)"
info "Kernel:            $(uname -sr)"
info "Dry-run mode:      ${DRY_RUN}"

if [[ $(id -u) -ne 0 ]]; then
    fail "This script must be run with sudo / as root."
    echo "  Run:  sudo $0"
    exit 1
fi

if [[ "$REAL_USER" == "root" ]]; then
    warn "SUDO_USER is not set — you appear to be in a raw root shell."
    warn "For best results, run:  sudo ./fix-root-display.sh  from your normal user session."
fi

# --------------------------------------------------------------------------
# 1. Display Server Detection
# --------------------------------------------------------------------------
section "Display Server Detection"

DISPLAY_TYPE="unknown"
IS_XWAYLAND=false

# Helper: probe the real user's processes for display env vars
probe_user_env() {
    local varname="$1"
    local found=""
    if [[ "$REAL_USER" != "root" ]]; then
        # First try known compositors/DMs
        for pid in $(pgrep -u "$REAL_USER" -x "gnome-shell|kwin_wayland|kwin_x11|Xwayland|sway|hyprland|Xorg|gnome-session-b|dbus-daemon" 2>/dev/null || true); do
            local envfile="/proc/${pid}/environ"
            if [[ -r "$envfile" ]]; then
                found=$(tr '\0' '\n' < "$envfile" | grep "^${varname}=" | head -1 | cut -d= -f2- || true)
                [[ -n "$found" ]] && break
            fi
        done
        # Fallback: scan more processes
        if [[ -z "$found" ]]; then
            for pid in $(pgrep -u "$REAL_USER" 2>/dev/null | head -50); do
                local envfile="/proc/${pid}/environ"
                if [[ -r "$envfile" ]]; then
                    found=$(tr '\0' '\n' < "$envfile" | grep "^${varname}=" | head -1 | cut -d= -f2- || true)
                    [[ -n "$found" ]] && break
                fi
            done
        fi
    fi
    echo "$found"
}

# Method 1: loginctl session type (most reliable on systemd)
LOGINCTL_TYPE=""
if command -v loginctl &>/dev/null && [[ "$REAL_USER" != "root" ]]; then
    # Get the active session for the user
    ACTIVE_SESSION=$(loginctl list-sessions --no-legend 2>/dev/null | awk -v u="$REAL_USER" '$3==u {print $1; exit}' || true)
    if [[ -n "$ACTIVE_SESSION" ]]; then
        LOGINCTL_TYPE=$(loginctl show-session "$ACTIVE_SESSION" -p Type --value 2>/dev/null || true)
        info "loginctl reports session type: ${LOGINCTL_TYPE:-unknown}"
    fi
fi

# Method 2: Check env vars (what sudo preserved + what we can recover)
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    DISPLAY_TYPE="wayland"
    ok "Wayland session detected (WAYLAND_DISPLAY=${WAYLAND_DISPLAY})"
elif [[ -n "${DISPLAY:-}" ]]; then
    # DISPLAY is set, but this could be XWayland — check further
    DISPLAY_TYPE="x11"
    ok "X11 display found (DISPLAY=${DISPLAY})"
else
    info "No DISPLAY or WAYLAND_DISPLAY in current env — probing real user's session..."

    FOUND_WAYLAND=$(probe_user_env WAYLAND_DISPLAY)
    FOUND_DISPLAY=$(probe_user_env DISPLAY)
    FOUND_XAUTH=$(probe_user_env XAUTHORITY)
    FOUND_XDG_RT=$(probe_user_env XDG_RUNTIME_DIR)

    if [[ -n "$FOUND_WAYLAND" ]]; then
        DISPLAY_TYPE="wayland"
        export WAYLAND_DISPLAY="$FOUND_WAYLAND"
        ok "Recovered WAYLAND_DISPLAY=${FOUND_WAYLAND} from user processes"
    fi
    if [[ -n "$FOUND_DISPLAY" ]]; then
        [[ "$DISPLAY_TYPE" == "unknown" ]] && DISPLAY_TYPE="x11"
        export DISPLAY="$FOUND_DISPLAY"
        ok "Recovered DISPLAY=${FOUND_DISPLAY} from user processes"
    fi
    [[ -n "$FOUND_XAUTH" ]] && export XAUTHORITY="$FOUND_XAUTH"
    [[ -n "$FOUND_XDG_RT" ]] && export XDG_RUNTIME_DIR="$FOUND_XDG_RT"
fi

# Always try to recover WAYLAND_DISPLAY if we don't have it yet (XWayland detection)
if [[ -z "${WAYLAND_DISPLAY:-}" && "$REAL_USER" != "root" ]]; then
    FOUND_WAYLAND=$(probe_user_env WAYLAND_DISPLAY)
    if [[ -n "$FOUND_WAYLAND" ]]; then
        export WAYLAND_DISPLAY="$FOUND_WAYLAND"
        DISPLAY_TYPE="wayland"
        IS_XWAYLAND=true
        ok "Recovered WAYLAND_DISPLAY=${FOUND_WAYLAND} — this is a Wayland session using XWayland"
    fi
fi

# Also recover XDG_RUNTIME_DIR and XAUTHORITY if missing
if [[ -z "${XDG_RUNTIME_DIR:-}" && "$REAL_USER" != "root" ]]; then
    FOUND_XDG_RT=$(probe_user_env XDG_RUNTIME_DIR)
    [[ -n "$FOUND_XDG_RT" ]] && export XDG_RUNTIME_DIR="$FOUND_XDG_RT"
fi
if [[ -z "${XAUTHORITY:-}" && "$REAL_USER" != "root" ]]; then
    FOUND_XAUTH=$(probe_user_env XAUTHORITY)
    [[ -n "$FOUND_XAUTH" ]] && export XAUTHORITY="$FOUND_XAUTH"
fi

# Detect XWayland from XAUTHORITY path or loginctl
if [[ "${XAUTHORITY:-}" == *"Xwayland"* || "${XAUTHORITY:-}" == *"mutter-Xwayland"* ]]; then
    IS_XWAYLAND=true
    [[ "$DISPLAY_TYPE" == "x11" ]] && DISPLAY_TYPE="wayland"
    info "XAUTHORITY path indicates XWayland — real session is Wayland"
fi
if [[ "$LOGINCTL_TYPE" == "wayland" && "$DISPLAY_TYPE" == "x11" ]]; then
    IS_XWAYLAND=true
    DISPLAY_TYPE="wayland"
    info "loginctl confirms Wayland session — DISPLAY is via XWayland"
fi

# Final status
if [[ "$DISPLAY_TYPE" == "wayland" && "$IS_XWAYLAND" == true ]]; then
    ok "Session type: Wayland + XWayland (DISPLAY=${DISPLAY:-unset}, WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset})"
elif [[ "$DISPLAY_TYPE" == "wayland" ]]; then
    ok "Session type: Wayland (WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset})"
elif [[ "$DISPLAY_TYPE" == "x11" ]]; then
    ok "Session type: X11 (DISPLAY=${DISPLAY:-unset})"
fi

if [[ "$DISPLAY_TYPE" == "unknown" ]]; then
    fail "Could not detect any active display session."
    echo "     Make sure you are running this from within a desktop session (not SSH/tty)."
fi

# --------------------------------------------------------------------------
# 2. X11 Checks
# --------------------------------------------------------------------------
if [[ "$DISPLAY_TYPE" == "x11" || -n "${DISPLAY:-}" ]]; then
    section "X11 Configuration"

    # DISPLAY variable
    if [[ -n "${DISPLAY:-}" ]]; then
        ok "DISPLAY is set: ${DISPLAY}"
    else
        fail "DISPLAY is not set."
    fi

    # Xauthority
    XAUTH_FILE="${XAUTHORITY:-${REAL_HOME}/.Xauthority}"
    info "XAUTHORITY path: ${XAUTH_FILE}"

    if [[ -f "$XAUTH_FILE" ]]; then
        ok "Xauthority file exists: ${XAUTH_FILE}"
        XAUTH_PERMS=$(stat -c '%a %U:%G' "$XAUTH_FILE")
        info "  Permissions: ${XAUTH_PERMS}"

        if [[ -r "$XAUTH_FILE" ]]; then
            ok "Xauthority file is readable by root"
        else
            fail "Xauthority file is NOT readable by root"
        fi

        # Verify it has entries
        if command -v xauth &>/dev/null; then
            ENTRY_COUNT=$(xauth -f "$XAUTH_FILE" list 2>/dev/null | wc -l || echo 0)
            if [[ "$ENTRY_COUNT" -gt 0 ]]; then
                ok "Xauthority has ${ENTRY_COUNT} auth entries"
            else
                fail "Xauthority file has 0 entries — display auth will fail"
            fi
        else
            warn "xauth command not found — cannot validate entries"
            echo "     Install with:  dnf install xorg-x11-xauth"
        fi
    else
        fail "Xauthority file not found at ${XAUTH_FILE}"
        echo "     The real user may be using a non-standard path or gdm/sddm managed auth."

        # Check for gdm-managed xauth
        GDM_XAUTH=$(find /run/user/"${REAL_UID}"/ -name 'Xauthority' -o -name '.mutter-Xwaylandauth.*' 2>/dev/null | head -1 || true)
        if [[ -n "$GDM_XAUTH" ]]; then
            info "Found display-manager auth file: ${GDM_XAUTH}"
            XAUTH_FILE="$GDM_XAUTH"
        fi
    fi

    # Test X connection
    if command -v xdpyinfo &>/dev/null; then
        export XAUTHORITY="${XAUTH_FILE}"
        if xdpyinfo -display "${DISPLAY}" &>/dev/null; then
            ok "X server connection successful"
        else
            fail "Cannot connect to X server on ${DISPLAY}"
            echo "     This is the core problem — root cannot authenticate to the X display."
        fi
    fi

    # xhost check
    if command -v xhost &>/dev/null; then
        XHOST_OUT=$(DISPLAY="${DISPLAY}" XAUTHORITY="${XAUTH_FILE}" xhost 2>/dev/null || true)
        if echo "$XHOST_OUT" | grep -qi "access control disabled"; then
            warn "xhost access control is DISABLED (any user can connect) — insecure but functional"
        elif echo "$XHOST_OUT" | grep -qi "SI:localuser:root"; then
            ok "xhost already allows root"
        else
            info "Current xhost policy:"
            echo "$XHOST_OUT" | sed 's/^/     /'
        fi
    fi
fi

# --------------------------------------------------------------------------
# 3. Wayland Checks
# --------------------------------------------------------------------------
if [[ "$DISPLAY_TYPE" == "wayland" || -n "${WAYLAND_DISPLAY:-}" || "$IS_XWAYLAND" == true ]]; then
    section "Wayland Configuration"

    XDG_RT="${XDG_RUNTIME_DIR:-/run/user/${REAL_UID}}"
    info "XDG_RUNTIME_DIR: ${XDG_RT}"

    if [[ -d "$XDG_RT" ]]; then
        ok "XDG_RUNTIME_DIR exists and is accessible"
    else
        fail "XDG_RUNTIME_DIR (${XDG_RT}) does not exist or is not accessible"
    fi

    WAYLAND_SOCK="${XDG_RT}/${WAYLAND_DISPLAY:-wayland-0}"
    if [[ -S "$WAYLAND_SOCK" ]]; then
        ok "Wayland socket exists: ${WAYLAND_SOCK}"
        SOCK_PERMS=$(stat -c '%a %U:%G' "$WAYLAND_SOCK")
        info "  Permissions: ${SOCK_PERMS}"
        if [[ -r "$WAYLAND_SOCK" && -w "$WAYLAND_SOCK" ]]; then
            ok "Wayland socket is readable/writable by root"
        else
            warn "Wayland socket may not be accessible by root"
        fi
    elif [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
        fail "Wayland socket not found at ${WAYLAND_SOCK}"
    else
        info "WAYLAND_DISPLAY not set — cannot check Wayland socket directly"
    fi

    if [[ "$IS_XWAYLAND" == true ]]; then
        info "Your session is Wayland with XWayland providing X11 compatibility."
        info "Electron will connect via XWayland using DISPLAY=${DISPLAY:-unset}."
        if [[ -n "${DISPLAY:-}" ]]; then
            ok "XWayland is available (DISPLAY=${DISPLAY})"
        else
            fail "XWayland DISPLAY is not set — Electron cannot connect."
        fi
    else
        info "Note: Most Wayland compositors do NOT allow root GUI apps natively."
        info "Electron on Wayland under root typically needs XWayland (X11 compat)."
        if [[ -n "${DISPLAY:-}" ]]; then
            ok "XWayland appears available (DISPLAY=${DISPLAY})"
        else
            warn "No DISPLAY set — XWayland may not be running."
            echo "     Electron may need --ozone-platform=x11 or XWayland enabled."
        fi
    fi
fi

# --------------------------------------------------------------------------
# 4. DBUS Session Bus
# --------------------------------------------------------------------------
section "D-Bus Session Bus"

if [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
    ok "DBUS_SESSION_BUS_ADDRESS is set: ${DBUS_SESSION_BUS_ADDRESS}"
else
    fail "DBUS_SESSION_BUS_ADDRESS is not set."
    echo "     Many Electron features (tray, notifications, file dialogs) need D-Bus."

    # Try to recover from user processes
    FOUND_DBUS=$(probe_user_env DBUS_SESSION_BUS_ADDRESS)

    # Fallback: try the well-known socket path
    if [[ -z "$FOUND_DBUS" ]]; then
        USER_XDG_RT="${XDG_RUNTIME_DIR:-/run/user/${REAL_UID}}"
        DBUS_SOCK="${USER_XDG_RT}/bus"
        if [[ -S "$DBUS_SOCK" ]]; then
            FOUND_DBUS="unix:path=${DBUS_SOCK}"
            info "Found D-Bus socket at well-known path: ${DBUS_SOCK}"
        fi
    fi

    if [[ -n "$FOUND_DBUS" ]]; then
        ok "Recovered DBUS address: ${FOUND_DBUS}"
        export DBUS_SESSION_BUS_ADDRESS="$FOUND_DBUS"
    else
        warn "Could not recover DBUS_SESSION_BUS_ADDRESS."
        echo "     Checked: user process environments, /run/user/${REAL_UID}/bus"
        echo "     Electron may still work but tray/notifications/file dialogs may fail."
    fi
fi

# --------------------------------------------------------------------------
# 5. XDG_RUNTIME_DIR
# --------------------------------------------------------------------------
section "XDG_RUNTIME_DIR"

ROOT_XDG="/run/user/0"
USER_XDG="/run/user/${REAL_UID}"

if [[ -d "$ROOT_XDG" ]]; then
    ok "Root XDG_RUNTIME_DIR exists: ${ROOT_XDG}"
else
    warn "Root XDG_RUNTIME_DIR (${ROOT_XDG}) does not exist."
    if [[ "$DRY_RUN" == false ]]; then
        mkdir -p "$ROOT_XDG"
        chmod 700 "$ROOT_XDG"
        fix "Created ${ROOT_XDG} with mode 700"
    else
        info "Would create ${ROOT_XDG}"
    fi
fi

if [[ -d "$USER_XDG" ]]; then
    ok "User XDG_RUNTIME_DIR exists: ${USER_XDG}"
else
    warn "User XDG_RUNTIME_DIR (${USER_XDG}) does not exist."
fi

# --------------------------------------------------------------------------
# 6. Electron / Chromium Sandbox
# --------------------------------------------------------------------------
section "Electron Sandbox (chrome-sandbox)"

info "Electron requires either:"
info "  1. A setuid chrome-sandbox binary, OR"
info "  2. --no-sandbox flag (less secure but common for root)"

if [[ $(id -u) -eq 0 ]]; then
    warn "Running Electron as root usually requires --no-sandbox"
    info "  Chromium refuses to run its sandbox as root for security reasons."
    info "  This is expected — you will likely need --no-sandbox."
fi

# Find chrome-sandbox in common locations
SANDBOX_PATHS=(
    "/usr/lib/electron/chrome-sandbox"
    "/usr/lib64/electron/chrome-sandbox"
    "/usr/share/electron/chrome-sandbox"
    "./node_modules/electron/dist/chrome-sandbox"
)
SANDBOX_FOUND=false
for sp in "${SANDBOX_PATHS[@]}"; do
    if [[ -f "$sp" ]]; then
        PERMS=$(stat -c '%a %U:%G' "$sp")
        SANDBOX_FOUND=true
        if [[ $(stat -c '%a' "$sp") == "4755" ]]; then
            ok "chrome-sandbox found with correct setuid: ${sp} (${PERMS})"
        else
            warn "chrome-sandbox found but wrong permissions: ${sp} (${PERMS})"
            echo "     Expected: 4755 root:root"
            if [[ "$DRY_RUN" == false ]]; then
                chown root:root "$sp"
                chmod 4755 "$sp"
                fix "Set ${sp} to 4755 root:root"
            fi
        fi
    fi
done
if [[ "$SANDBOX_FOUND" == false ]]; then
    info "No chrome-sandbox binary found in standard locations (not necessarily a problem)."
fi

# --------------------------------------------------------------------------
# 7. GPU / Rendering
# --------------------------------------------------------------------------
section "GPU & Rendering"

if [[ -d /dev/dri ]]; then
    ok "/dev/dri exists — GPU devices available"
    ls -la /dev/dri/ 2>/dev/null | sed 's/^/     /'
else
    warn "/dev/dri not found — no GPU acceleration (Electron will use software rendering)"
fi

if command -v glxinfo &>/dev/null; then
    GLX_RENDERER=$(DISPLAY="${DISPLAY:-:0}" XAUTHORITY="${XAUTH_FILE:-}" glxinfo 2>/dev/null | grep "OpenGL renderer" | head -1 || true)
    if [[ -n "$GLX_RENDERER" ]]; then
        ok "GLX: ${GLX_RENDERER}"
    else
        warn "glxinfo could not query the renderer (display auth issue or no GPU)"
    fi
fi

# --------------------------------------------------------------------------
# 8. Summary & Generated Command
# --------------------------------------------------------------------------
section "Summary"

echo
if [[ $PROBLEMS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All checks passed!${RESET}"
elif [[ $PROBLEMS -eq 0 ]]; then
    echo -e "${YELLOW}${BOLD}${WARNINGS} warning(s), but no critical problems.${RESET}"
else
    echo -e "${RED}${BOLD}${PROBLEMS} problem(s) found, ${WARNINGS} warning(s).${RESET}"
fi
if [[ $FIXES_APPLIED -gt 0 ]]; then
    echo -e "${GREEN}${FIXES_APPLIED} fix(es) applied.${RESET}"
fi

# --------------------------------------------------------------------------
# 9. Apply xhost fix (if X11) and build the recommended command
# --------------------------------------------------------------------------
section "Recommended Fix / Run Command"

CMD_VARS=()
CMD_FLAGS="--no-sandbox"

# -- X11 auth fix --
XAUTH_TO_USE="${XAUTH_FILE:-${XAUTHORITY:-${REAL_HOME}/.Xauthority}}"

if [[ -n "${DISPLAY:-}" ]]; then
    if [[ "$DRY_RUN" == false && "$REAL_USER" != "root" ]]; then
        # Grant root access via xhost (safest per-user method)
        if command -v xhost &>/dev/null; then
            su - "$REAL_USER" -c "DISPLAY=${DISPLAY} XAUTHORITY=${XAUTH_TO_USE} xhost +si:localuser:root" 2>/dev/null && \
                fix "Ran xhost +si:localuser:root for the current session" || true
        fi

        # Also copy the xauth cookie to root so it persists
        if command -v xauth &>/dev/null && [[ -f "$XAUTH_TO_USE" ]]; then
            COOKIE=$(su - "$REAL_USER" -c "XAUTHORITY=${XAUTH_TO_USE} xauth list ${DISPLAY} 2>/dev/null" | head -1 || true)
            if [[ -n "$COOKIE" ]]; then
                echo "$COOKIE" | xauth merge - 2>/dev/null && \
                    fix "Copied X auth cookie to root's Xauthority" || true
            fi
        fi
    fi

    CMD_VARS+=("DISPLAY=${DISPLAY}")
    if [[ -f "$XAUTH_TO_USE" ]]; then
        CMD_VARS+=("XAUTHORITY=${XAUTH_TO_USE}")
    fi
fi

# -- XDG_RUNTIME_DIR (critical for Wayland socket + DBUS socket access) --
USER_XDG_RT="${XDG_RUNTIME_DIR:-/run/user/${REAL_UID}}"
if [[ -d "$USER_XDG_RT" ]]; then
    CMD_VARS+=("XDG_RUNTIME_DIR=${USER_XDG_RT}")
fi

# -- DBUS --
if [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
    CMD_VARS+=("DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS}")
fi

# -- Electron flags for root --
# On Wayland+XWayland, force X11 platform for best compat
if [[ "$IS_XWAYLAND" == true ]]; then
    CMD_FLAGS="--no-sandbox"
    info "XWayland detected — Electron will use X11 via XWayland by default."
fi

# Build the env string for display
CMD_ENV=""
for v in "${CMD_VARS[@]}"; do
    CMD_ENV="${CMD_ENV:+${CMD_ENV} }${v}"
done

echo
echo -e "${BOLD}To run your Electron app as root, use:${RESET}"
echo
echo -e "  sudo ${CMD_ENV} /path/to/your-electron-app ${CMD_FLAGS}"
echo
echo -e "${BOLD}Or for an npm/yarn dev server:${RESET}"
echo
echo -e "  sudo ${CMD_ENV} npx electron . ${CMD_FLAGS}"
echo
echo -e "${BOLD}Or set these in your shell before running:${RESET}"
echo
for var in "${CMD_VARS[@]}"; do
    echo "  export ${var}"
done
echo "  your-electron-app ${CMD_FLAGS}"
echo

# Offer a convenience wrapper script
echo -e "${BOLD}Or generate a wrapper script (copy-paste this):${RESET}"
echo
echo "  cat > /usr/local/bin/run-electron-root << 'WRAPPER'"
echo "  #!/usr/bin/env bash"
echo "  # Auto-generated wrapper for running Electron apps as root"
echo "  REAL_USER=\${SUDO_USER:-\$USER}"
echo "  REAL_UID=\$(id -u \"\$REAL_USER\" 2>/dev/null)"
echo "  export XDG_RUNTIME_DIR=/run/user/\${REAL_UID}"
for v in "${CMD_VARS[@]}"; do
    case "$v" in XDG_RUNTIME_DIR=*) continue ;; esac
    echo "  export ${v}"
done
echo "  exec \"\$@\" ${CMD_FLAGS}"
echo "  WRAPPER"
echo "  chmod +x /usr/local/bin/run-electron-root"
echo
echo "  # Then use:  sudo run-electron-root /path/to/your-electron-app"
echo

if [[ "$DISPLAY_TYPE" == "wayland" ]]; then
    echo -e "${YELLOW}Wayland note:${RESET} If the app still fails, also try adding:"
    echo "  --ozone-platform=x11      (force X11/XWayland — usually best)"
    echo "  --ozone-platform=wayland  (native Wayland, experimental)"
    echo
fi

echo -e "${CYAN}Tip:${RESET} If you want to avoid sudo entirely, consider running the app"
echo "as your normal user and using pkexec/polkit for privileged operations."
