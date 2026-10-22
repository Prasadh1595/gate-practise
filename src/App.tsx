import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import TestLibrary from './pages/TestLibrary';
import TestInstructions from './pages/TestInstructions';
import ExamScreen from './pages/ExamScreen';
import ResultPage from './pages/ResultPage';
import ReviewPage from './pages/ReviewPage';
import AttemptHistory from './pages/AttemptHistory';
import Analytics from './pages/Analytics';
import ProgressBank from './pages/ProgressBank';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/exam/:attemptId" element={
            <ProtectedRoute><ExamScreen /></ProtectedRoute>
          } />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<TestLibrary />} />
            <Route path="/test/:testId" element={<TestInstructions />} />
            <Route path="/results/:attemptId" element={<ResultPage />} />
            <Route path="/review/:attemptId" element={<ReviewPage />} />
            <Route path="/history" element={<AttemptHistory />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/progress" element={<ProgressBank />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
