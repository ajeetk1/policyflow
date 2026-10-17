"use client";

import { useState } from "react";
import { checkBackend } from "@/lib/backend";

export default function BackendConnectionTest() {
  const [message, setMessage] = useState("Not tested");
  const [loading, setLoading] = useState(false);

  async function testConnection() {
    setLoading(true);
    setMessage("Connecting...");

    try {
      const result = await checkBackend();
      setMessage(`Connected: ${result.status}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={testConnection}
        disabled={loading}
      >
        {loading ? "Testing..." : "Test backend connection"}
      </button>

      <p>{message}</p>
    </div>
  );
}
