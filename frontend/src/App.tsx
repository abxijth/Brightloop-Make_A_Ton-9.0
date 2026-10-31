import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { AuthPage } from './pages/AuthPage';

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthPage />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
