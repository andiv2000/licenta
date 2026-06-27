# Exam Analyzer Frontend

Modern React + TypeScript frontend for the Exam Analyzer application.

## Getting Started

### Prerequisites
- Node.js 16+ and npm

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (development server) and will proxy API requests to `http://localhost:5000/api`.

### Build

```bash
npm run build
```

Builds the application for production. The output will be in the `dist` folder.

### Preview

```bash
npm run preview
```

Preview the production build locally.

## Structure

```
frontend/
├── src/
│   ├── api/           # API client and services
│   ├── components/    # Reusable React components
│   ├── pages/         # Page components
│   ├── store/         # Zustand state management
│   ├── styles/        # CSS and Tailwind styles
│   ├── utils/         # Helper functions
│   ├── App.tsx        # Main app component
│   └── main.tsx       # App entry point
├── index.html         # HTML template
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
├── vite.config.ts     # Vite config
└── tailwind.config.js # Tailwind CSS config
```

## Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router v6** - Routing
- **Zustand** - State management
- **Axios** - HTTP client

## Features

- User authentication with role-based access
- Exam sheet upload and analysis
- Real-time progress tracking
- Batch processing support
- Admin settings panel
- Responsive design
- Dark mode support (planned)

## Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## API Integration

The frontend communicates with the backend API at `/api`. All routes are defined in `src/api/client.ts`.

## Contributing

Please follow the existing code style and structure. Use TypeScript for type safety.

## License

MIT
