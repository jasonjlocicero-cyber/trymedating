import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const navLinkStyle = ({ isActive }) => ({
    padding: "6px 10px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600,
    color: isActive ? "#0f172a" : "#111827",
    background: isActive ? "#eef2ff" : "transparent",
    border: "1px solid var(--border)",
  });

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "#fff",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0",
        }}
      >
        {/* Brand: logo image + wordmark */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
            lineHeight: 1,
          }}
        >
          <img
            src="/logo-mark.png"
            alt="TryMeDating logo"
            style={{
              height: "clamp









