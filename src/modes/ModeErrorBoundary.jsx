import { Component } from 'react'

export default class ModeErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.error('[labmode] mode crashed, returning to normal:', err)
    this.props.onError?.()
  }

  componentDidUpdate(prev) {
    if (prev.children !== this.props.children && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
