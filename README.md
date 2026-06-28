# AutoClip AI

AI-powered video clipping dashboard based on OpusClip API. Transform long-form videos into engaging short clips automatically.

## 🚀 Features

- **Video URL Input**: Paste YouTube, TikTok, or any video URL
- **AI-Powered Clipping**: Automatically generates short-form clips using OpusClip API
- **Project Management**: Track all your clipping projects with status monitoring
- **Clip Preview & Download**: Preview clips and download in various formats
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Database Persistence**: All projects and clips stored locally in Turso database
- **API Logging**: Track all API requests and responses

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Turso (LibSQL)
- **ORM**: Drizzle ORM
- **Icons**: Lucide React
- **External API**: OpusClip API

## 📋 Prerequisites

- Node.js 18+ and npm/pnpm/yarn
- OpusClip API key ([Get it here](https://www.opus.pro/))
- Turso account and database ([Sign up here](https://turso.tech/))

## ⚙️ Installation

1. **Clone or download the project**

```bash
cd AiClipper
```

2. **Install dependencies**

```bash
npm install
# or
pnpm install
# or
yarn install
```

3. **Set up environment variables**

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# OpusClip API Configuration (REQUIRED)
OPUS_API_KEY=your_opus_api_key_here
OPUS_API_BASE_URL=https://api.opus.pro
OPUS_ORG_ID=your_org_id_here

# Turso Database Configuration (REQUIRED)
DATABASE_URL=libsql://your-database-name.turso.io
DATABASE_AUTH_TOKEN=your_database_auth_token_here

# Application Configuration
NEXT_PUBLIC_APP_NAME=AutoClip AI
```

**How to get your credentials:**

- **OpusClip API Key**: Visit [opus.pro](https://www.opus.pro/) → Dashboard → API Settings
- **Turso Database**: 
  ```bash
  # Install Turso CLI
  curl -sSfL https://get.tur.so/install.sh | bash
  
  # Login
  turso auth login
  
  # Create database
  turso db create autoclip-ai
  
  # Get connection URL
  turso db show autoclip-ai --url
  
  # Get auth token
  turso db tokens create autoclip-ai
  ```

4. **Set up the database**

Push the database schema:

```bash
npm run db:push
```

This will create all necessary tables in your Turso database.

5. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
AiClipper/
├── app/                          # Next.js App Router pages
│   ├── api/                      # Backend API routes
│   │   └── projects/            # Project & clip management
│   ├── dashboard/               # Dashboard page
│   ├── projects/                # Projects list & detail pages
│   ├── page.tsx                 # Home page
│   └── layout.tsx               # Root layout
├── components/                   # React components
│   ├── layout/                  # Layout components (Sidebar, Header)
│   ├── home/                    # Home page components
│   ├── project/                 # Project-related components
│   ├── clip/                    # Clip-related components
│   └── ui/                      # Reusable UI components
├── lib/                         # Utility libraries
│   ├── db/                      # Database (schema, connection)
│   ├── opus/                    # OpusClip API client
│   └── utils.ts                 # Utility functions
└── types/                       # TypeScript type definitions
```

## 🎯 Usage

1. **Create a Project**
   - Enter a video URL on the home page
   - Click "Get clips in 1 click"
   - Wait for OpusClip to process your video

2. **View Projects**
   - Navigate to Projects page
   - See all your clipping projects with status

3. **View Clips**
   - Open a project detail page
   - Click "Sync Clips" to fetch generated clips
   - Preview, download, or copy captions

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push database schema
npm run db:studio    # Open Drizzle Studio (database GUI)
npm run db:generate  # Generate migrations
```

## 🗄️ Database Schema

The application uses 4 main tables:

- **projects**: Video clipping projects
- **clips**: Generated video clips
- **brand_templates**: OpusClip brand templates
- **api_logs**: API request/response logs

## 🔐 Security Notes

- Never commit `.env` file to version control
- Keep your OpusClip API key secure
- Database credentials should be kept private
- All API keys are backend-only (never exposed to frontend)

## 📝 API Endpoints

- `POST /api/projects` - Create new project
- `GET /api/projects` - List all projects
- `GET /api/projects/[id]` - Get project details
- `POST /api/projects/[id]/sync-clips` - Sync clips from OpusClip
- `GET /api/projects/[id]/clips` - Get project clips

## 🤝 Contributing

This is a template project. Feel free to customize and extend it for your needs.

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 🐛 Troubleshooting

**"API key not found" error**
- Ensure `OPUS_API_KEY` is set in `.env`
- Restart the development server after adding environment variables

**Database connection error**
- Verify `DATABASE_URL` and `DATABASE_AUTH_TOKEN` are correct
- Run `npm run db:push` to ensure schema is up to date

**"Project not found" error**
- The project may still be processing on OpusClip
- Wait a few minutes and try syncing clips again

## 📞 Support

For OpusClip API issues, visit [opus.pro/support](https://www.opus.pro/)

---

Built with ❤️ using Next.js and OpusClip API
