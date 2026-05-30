# RemoteDesk

A complete remote desktop solution with three components: a cross-platform Python agent, a Node.js WebSocket relay, and a Next.js web client.

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket      ┌─────────────┐
│ Python Agent│ ◄────────────────► │ Relay Server│ ◄────────────────► │  Web Client │
│ (screenshot │   frames/commands  │  (Node.js)  │   frames/commands  │  (Next.js)  │
│  + input)   │                      │             │                      │             │
└─────────────┘                      └─────────────┘                      └─────────────┘
```

## WebSocket Protocol

All connections authenticate with a JSON message (token is **not** sent in the URL):

```json
{ "type": "auth", "role": "agent" | "client", "token": "SECRET_TOKEN" }
```

| Message | Direction | Description |
|---------|-----------|-------------|
| `auth_ok` / `auth_error` | Relay → peer | Authentication result |
| `frame` | Agent → clients | Full or dirty JPEG rects (base64) |
| `command` | Client → agent | Mouse/keyboard actions |
| `ping` / `pong` | Any | Latency measurement |
| `agent_status` | Relay → clients | Agent online/offline |
| `heartbeat` | Relay → all | Keep-alive every 10s |

### Frame format

```json
{
  "type": "frame",
  "mode": "full" | "dirty",
  "width": 1920,
  "height": 1080,
  "rects": [{ "x": 0, "y": 0, "w": 100, "h": 100, "data": "<base64 jpeg>" }],
  "timestamp": 1234567890,
  "quality": 75
}
```

### Command format

```json
{ "type": "command", "action": "mouse_move", "x": 100, "y": 200 }
```

Supported actions: `mouse_move`, `mouse_click`, `mouse_double_click`, `mouse_drag`, `mouse_scroll`, `key_press`, `key_combo`, `type_text`, `lock_screen`, `ctrl_alt_del`

---

## Quick Start (Local Development)

### 1. Relay Server

```bash
cd relay
npm install
SECRET_TOKEN=my-secret-token node index.js
```

Runs on `ws://localhost:8080`.

### 2. Desktop Agent

```bash
cd agent
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: RELAY_URL=ws://localhost:8080, SECRET_TOKEN=my-secret-token
python agent.py
```

### 3. Web Client

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000, enter token `my-secret-token`, relay URL `ws://localhost:8080`.

---

## Deploy Relay to Railway

1. Push this repo to GitHub.
2. Create a new project on [Railway](https://railway.app).
3. Add a service from the `relay/` directory.
4. Set environment variable: `SECRET_TOKEN=your-strong-random-token`
5. Railway assigns a public URL. Use `wss://your-app.up.railway.app` as the relay URL.

The included `railway.json` and `Procfile` configure the start command automatically.

---

## Deploy Web Client to Vercel

1. Import the repo in [Vercel](https://vercel.com).
2. Set root directory to `web/`.
3. Add environment variable (optional): `NEXT_PUBLIC_RELAY_URL=wss://your-app.up.railway.app`
4. Deploy. Users can override the relay URL on the login page.

Use **HTTPS/WSS** in production.

---

## Agent Setup by Platform

### macOS (launchd auto-start)

Create `~/Library/LaunchAgents/com.remotedesk.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.remotedesk.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/remotedesk/agent/venv/bin/python</string>
    <string>/path/to/remotedesk/agent/agent.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/remotedesk/agent</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/remotedesk-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/remotedesk-agent.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.remotedesk.agent.plist
```

Grant **Accessibility** and **Screen Recording** permissions to Terminal/Python in System Settings.

### Windows (Task Scheduler)

**start-agent.bat** (place in agent folder):

```bat
@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python agent.py
```

Import **remotedesk-task.xml** in Task Scheduler (create task → Import):

```xml
<?xml version="1.0" encoding="UTF-16"?>
<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>C:\path\to\remotedesk\agent\start-agent.bat</Command>
      <WorkingDirectory>C:\path\to\remotedesk\agent</WorkingDirectory>
    </Exec>
  </Actions>
  <Settings>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Principals>
    <Principal>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
</Task>
```

### Linux (systemd)

Create `/etc/systemd/system/remotedesk-agent.service`:

```ini
[Unit]
Description=RemoteDesk Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/remotedesk/agent
EnvironmentFile=/path/to/remotedesk/agent/.env
ExecStart=/path/to/remotedesk/agent/venv/bin/python agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable remotedesk-agent
sudo systemctl start remotedesk-agent
```

---

## iPhone / Mobile Connection

1. Deploy relay and web app with HTTPS/WSS.
2. On iPhone Safari, open your Vercel URL (e.g. `https://remotedesk.vercel.app`).
3. Enter relay URL (`wss://...`) and secret token.
4. Tap **Connect** — full-screen canvas with floating bottom toolbar.
5. **Gestures**: tap = click, double-tap = double-click, long-press = right-click, drag = drag, two-finger = scroll, pinch = zoom.
6. Add to Home Screen for an app-like experience (Share → Add to Home Screen).

---

## Settings

All client settings persist to `localStorage` under key `remotedesk_settings`. Categories:

- **Mouse**: cursor display/style, absolute/relative mode, scroll, drag, ctrl+click
- **Keyboard**: input mode, shortcut blocking, special keys toolbar, IME, layout
- **Display**: quality, FPS limit, hardware acceleration, color mode, scale
- **Advanced**: auto-reconnect, clipboard sync, session timeout

---

## Security Notes

- Use a strong random `SECRET_TOKEN` (32+ characters).
- Always use WSS/HTTPS in production.
- Token is sent in the WebSocket auth message, never in the URL.
- Rate limit: 60 commands/second per client on the relay.

---

## Project Structure

```
remotedesk/
├── agent/          Python desktop agent
├── relay/          Node.js WebSocket relay
├── web/            Next.js 14 web client
└── README.md
```

## License

MIT
