import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 40, color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap' } },
        React.createElement('h1', null, 'App crashed'),
        React.createElement('p', null, String(this.state.error)),
        React.createElement('pre', null, this.state.error?.stack)
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
