# Setting Up CarbonTrack IITBHU on macOS

This guide provides instructions to install prerequisites, set up, and run the CarbonTrack IITBHU application locally on macOS.

---

## 1. Install Prerequisites

You will need **Homebrew** (macOS package manager), **Node.js** (v18+), **MongoDB**, and **Redis** (for cache/sessions).

```bash
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Node.js (Vite & workspaces require v18+)
brew install node

# 3. Install and start MongoDB Community Server
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0

# 4. Install and start Redis Server
brew install redis
brew services start redis
```

---

## 2. Clone and Install Dependencies

This project is configured as an `npm` workspaces monorepo:

```bash
# Clone the repository
git clone https://github.com/Abhi241-bot/carbontrack-iitbhu.git
cd carbontrack-iitbhu

# Install workspace dependencies
npm install
```

---

## 3. Configure Environment Variables

Create local `.env` configuration files for both the frontend client and the backend server:

### Backend Server Configuration
Create `server/.env`:
```bash
cp server/.env.example server/.env
```
Open `server/.env` and update configuration values as needed:
* **`MONGODB_URI`**: Set to `mongodb://localhost:27017/carbon-portal` for local MongoDB development.
* **`PORT`**: Default is `5000`.

### Frontend Client Configuration
Create `client/.env`:
```bash
cp client/.env.example client/.env
```
Ensure `VITE_API_URL` points to your backend URL (default is `http://localhost:5000`).

---

## 4. Initialize Database (Seeding)

Seed default emission factors, default campuses, and initial database buildings:

```bash
npm run seed --workspace=server
```

---

## 5. Launch the Development Server

Start both the backend server and frontend client concurrently:

```bash
npm run dev
```

* **Vite React Frontend:** [http://localhost:5173](http://localhost:5173)
* **Express Backend API:** [http://localhost:5000](http://localhost:5000)
* **Default Admin Account:** `admin@itbhu.ac.in` / `ChangeMe123!`
