import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unknown error",
    };
  }

  componentDidCatch(error) {
    if (typeof window !== "undefined") {
      window.__appBootError = error?.stack || error?.message || String(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            margin: "24px auto",
            width: "min(760px, calc(100% - 32px))",
            border: "1px solid rgba(24,34,26,0.15)",
            borderRadius: "16px",
            background: "#fffef7",
            padding: "20px",
            color: "#18221a",
            fontFamily:
              "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: "24px" }}>页面加载失败</h1>
          <p style={{ margin: "0 0 12px", lineHeight: "1.7", color: "#555" }}>
            前端运行时出现异常，已触发兜底页面。请把下方错误复制给开发同学。
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: "1.6",
              background: "#f3f4f6",
              border: "1px solid rgba(24,34,26,0.12)",
              borderRadius: "10px",
              padding: "12px",
            }}
          >
            {this.state.message}
          </pre>
        </main>
      );
    }

    return this.props.children;
  }
}
