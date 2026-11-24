# Stock Quote Web Application

This is a Flask-based stock quote web application served with Gunicorn behind an Nginx round-robin load balancer across two application nodes (`7384-web-01` and `7384-web-02`). It retrieves market quote data from Twelve Data via RapidAPI (`twelve-data1.p.rapidapi.com`), caches responses in memory using a configurable TTL (`CACHE_TTL_SECONDS=60`) to minimize external API requests, and exposes health and quote endpoints alongside a browser interface.

## Features & Architecture

* Web Interface & API Endpoints: Serves the main UI at `/`, a health endpoint at `/api/health` returning backend identification (`X-Served-By`), and a quote lookup endpoint at `/api/quote?symbol=<TICKER>`.
* Response Caching: Caches quote responses for `CACHE_TTL_SECONDS` (`60` seconds by default) so repeated lookups for the same symbol return quickly without exhausting RapidAPI rate limits.
* Load-Balanced Infrastructure: An Nginx reverse proxy on `7384-lb-01` listens on port `80` and distributes traffic across `7384-web-01` and `7384-web-02` on port `5000`.

### Server Topology

| Role | Hostname | Public IP | Service & Port | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Load Balancer | `7384-lb-01` | `13.135.173.203` | Nginx (`1.18.0`) on port `80` | Round-robin reverse proxy across `Web01` and `Web02` |
| Web Server 1 | `7384-web-01` | `35.178.59.88` | Flask + Gunicorn on port `5000` | Sets `X-Served-By: 7384-web-01` |
| Web Server 2 | `7384-web-02` | `18.130.20.72` | Flask + Gunicorn on port `5000` | Sets `X-Served-By: 7384-web-02` |

---

## APIs & Documentation

This application uses the "Twelve Data" market data API accessed through "RapidAPI":

* API Provider / Host: Twelve Data via RapidAPI (`https://twelve-data1.p.rapidapi.com`)
* RapidAPI Hub Documentation: [RapidAPI Hub](https://rapidapi.com/hub)
* Twelve Data Official Documentation: [Twelve Data Documentation](https://twelvedata.com/docs)

### Environment Variables

Create a `.env` file (based on `.env.example`) in the project root with the following variables:

```env
RAPIDAPI_KEY=your_rapidapi_key_here(where I put in the api key from the dashborad on twelve data api)
RAPIDAPI_HOST=twelve-data1.p.rapidapi.com
PORT=5000
CACHE_TTL_SECONDS=60

1. Running the Application Locally
* clone the repo and enter the project directory
== git clone [https://github.com/otieno0928/assessment_folder.git](https://github.com/otieno0928/assessment_folder.git)
== cd assessment_folder

2. Creating and activating the virtual environment
#on powewrshell: python -m venv venv
.\venv\Scripts\Activate.ps1
#on the OS/Linux: python3 -m venv venv
source venv/bin/activate

3. Installing dependencies:
*pip install --upgrade pip
*pip install -r requirements.txt

4. Configuring the .env
*cp .env.example .env
(Here one should ensure .env defines RAPIDAPI_KEY, RAPIDAPI_HOST=twelve-data1.p.rapidapi.com, PORT=5000, and CACHE_TTL_SECONDS=60

5. Starting the Application locally:
*via Gunicorn(mirror production), run gunicorn --bind 0.0.0.0:5000 --workers 2 app:app
*via Flask( for local development); run python app.py

6. Verify Locally
*curl -i [http://127.0.0.1:5000/api/health](http://127.0.0.1:5000/api/health)
*curl -s "[http://127.0.0.1:5000/api/quote?symbol=AAPL](http://127.0.0.1:5000/api/quote?symbol=AAPL)"

                     **Deploying to the Web Servers( web01 and web02)**
1. SSH into the target web server via the key
*run ssh -i "$env:USERPROFILE\.ssh\id_rsa_webinfra" ubuntu@35.178.59.88 ( the web ip could be replaced in this command to switch from web01 to web02)

2. Installing system packages and cloning our folder into the server
* Run: 
sudo apt update && sudo apt install -y git python3-venv python3-pip
sudo mkdir -p /opt/assessment_folder
sudo chown -R "$USER":"$USER" /opt/assessment_folder
git clone [https://github.com/otieno0928/assessment_folder.git](https://github.com/otieno0928/assessment_folder.git) /opt/assessment_folder
cd /opt/assessment_folder

3. Set up the virtual environment and install the packages
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

4. Create .env with production values
*Run :
cp .env.example .env
cat <<'EOF' > .env
RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY
RAPIDAPI_HOST=twelve-data1.p.rapidapi.com
PORT=5000
CACHE_TTL_SECONDS=60
EOF


5. Launch Gunicorn in the background and check local health:
* Run:
nohup gunicorn --bind 0.0.0.0:5000 --workers 2 app:app > gunicorn.log 2>&1 &
curl -i [http://127.0.0.1:5000/api/health](http://127.0.0.1:5000/api/health)

                   **Configuring the load balancer ( 7384-lb-01)**
1. SSH into 7384-lb-01
* Run ssh -i "$env:USERPROFILE\.ssh\id_rsa_webinfra" ubuntu@13.135.173.203

2. Install Nginx and remove the default site:
sudo apt update && sudo apt install -y nginx
sudo rm -f /etc/nginx/sites-enabled/default


3. Configure round-robin upstream routing in
sudo tee /etc/nginx/conf.d/quote_lb.conf > /dev/null <<'EOF'
upstream quote_backends {
    server 35.178.59.88:5000;
    server 18.130.20.72:5000;
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://quote_backends;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

4. Tests configuration, enable Nginx and reload:
*Run sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx

                     _**Testing and verification**_
1. Verifying round-robin load balancing on /api/health and /
* Run :
1..6 | ForEach-Object { curl.exe -s -i "[http://13.135.173.203/api/health](http://13.135.173.203/api/health)" | Select-String "HTTP/|X-Served-By" }
curl.exe -s -i "[http://13.135.173.203/](http://13.135.173.203/)" | Select-String "HTTP/|X-Served-By"

N/B: One is to confirm HTTP/1.1 200 OK responses and X-Served-By alternating between 7384-web-01 and 7384-web-02

2. Verify live quote lookup and caching ( 60-second TTL)
* Run:
curl.exe -s -i "[http://13.135.173.203/api/quote?symbol=AAPL](http://13.135.173.203/api/quote?symbol=AAPL)"
curl.exe -s "[http://13.135.173.203/api/quote?symbol=AAPL](http://13.135.173.203/api/quote?symbol=AAPL)"

N/B:Confirm HTTP/1.1 200 OK, live market quote fields, "cached":false on the initial lookup, and "cached":true on repeated lookups within 60 seconds

3. Test in a browser and check logs
* Open http://13.135.173.203/ in a browser and perform a symbol search in the UI
* Inspect /opt/assessment_folder/gunicorn.log on Web01 and Web02 and /var/log/nginx/access.log and /var/log/nginx/error.log on Lb01 to confirm clean operation.

               **Challenges encountered in the process and how they were overcome** 
# Persistent SSH permission denied(publickey) and Host Key Prompts: A good number of times instances were provisioned before the updated SSH  public key was saved to the profile so i had to keep on asking for a new server, wait for about a minute for the ssh key to be configured or if required i genberated a new key and saved to myu intranet profile and waited for the server to configure the new key.

# Running commands leading to path and syntax errors: This occurred while running commands ($env:USERPROFILE) in the remote shell and the (&&) symbols. Running exit to return to Powershell when switching hosts moving into /opt/assessment_folder before editing .env or starting Gunicorn, and passing remote commands via ssh ... "..." resolved these issues.

# Missing 'nano' Editor: Trying to edit .env with nano returned command not found. Writing .env with cat <<'EOF' > .env avoided this missing-editor friction.

# Initial 404 Not Found Before Nginx Upstream Setup: Requesting /api/health on 7384-lb-01 prior to configuring /etc/nginx/conf.d/quote_lb.conf and reloading Nginx returned 404. Adding the quote_backends upstream configuration, validating with sudo nginx -t, and reloading Nginx immediately enabled 200 OK round-robin routing across both web servers

                                    **   Credits & Resources **
* Market Data API: Twelve Data and RapidAPI for providing market quote data via twelve-data1.p.rapidapi.com[cite: 18].

* Web Framework & WSGI Server: Flask and Gunicorn for serving the Python web application and endpoints.

* Reverse Proxy & Load Balancer: Nginx for port 80 reverse proxying and round-robin load balancing across backend nodes.

* Runtime & Version Control: Python and Git on Ubuntu Linux.
