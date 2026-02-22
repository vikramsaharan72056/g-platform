# 🎰 ABCRummy — Gaming Platform

## Project Overview & Vision

**ABCRummy** is a mobile-first, real-time betting/gaming platform offering 7 skill-based and luck-based games. The platform operates on a **time-period (round) based** model where each game session runs in fixed-duration rounds, and users place bets before each round begins.

> **Document Version:** 1.0  
> **Created:** 2026-02-21  
> **Status:** Planning Phase  

---

## 📋 Table of Contents

1. [Product Summary](#product-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Game Catalog](#game-catalog)
5. [Core Modules](#core-modules)
6. [Non-Functional Requirements](#non-functional-requirements)

---

## Product Summary

| Attribute            | Detail                                                        |
| -------------------- | ------------------------------------------------------------- |
| **Platform**         | Android (Mobile App)                                          |
| **Backend**          | Node.js + NestJS (REST + WebSocket)                           |
| **Database**         | PostgreSQL (primary) + Redis (caching, pub/sub, game state)   |
| **Admin Panel**      | React.js Web Application                                      |
| **Authentication**   | Email/Password + 2FA (TOTP)                                   |
| **Payments**         | QR Scanner-based Deposit, Admin-verified Withdrawal           |
| **Game Model**       | Time-period (round) based — all 7 games run in timed sessions |
| **Total Games**      | 7 (5 defined + 2 TBD)                                        |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐     │
│  │ Android App  │  │ Admin Panel (Web)│  │ (Future: iOS/Web) │     │
│  │ React Native │  │ React.js         │  │                   │     │
│  └──────┬───────┘  └────────┬─────────┘  └───────────────────┘     │
│         │                   │                                       │
└─────────┼───────────────────┼───────────────────────────────────────┘
          │ HTTPS / WSS       │ HTTPS
          ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / LOAD BALANCER                    │
│                      (Nginx / AWS ALB)                              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                       BACKEND SERVICES                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    NestJS Application                         │   │
│  │                                                              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐   │   │
│  │  │ Auth Module  │ │ User Module │ │ Wallet Module        │   │   │
│  │  │ - Signup     │ │ - Profile   │ │ - Balance            │   │   │
│  │  │ - Login      │ │ - KYC       │ │ - Deposit (QR)       │   │   │
│  │  │ - 2FA (TOTP) │ │ - History   │ │ - Withdrawal (Admin) │   │   │
│  │  └─────────────┘ └─────────────┘ └──────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │              GAME ENGINE (Core)                       │    │   │
│  │  │                                                      │    │   │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │    │   │
│  │  │  │ Teen Patti│ │ Aviator   │ │ 7 Up Down         │  │    │   │
│  │  │  └───────────┘ └───────────┘ └───────────────────┘  │    │   │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │    │   │
│  │  │  │ Dragon &  │ │ Poker     │ │ Game 6 (TBD)      │  │    │   │
│  │  │  │ Tiger     │ │           │ │                   │  │    │   │
│  │  │  └───────────┘ └───────────┘ └───────────────────┘  │    │   │
│  │  │  ┌───────────────────┐                               │    │   │
│  │  │  │ Game 7 (TBD)      │                               │    │   │
│  │  │  └───────────────────┘                               │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │              ADMIN MODULE                             │    │   │
│  │  │  - Game Result Control (Override/Rig)                 │    │   │
│  │  │  - Analytics Dashboard                                │    │   │
│  │  │  - Withdrawal Verification                            │    │   │
│  │  │  - User Management                                    │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────────┐
│ PostgreSQL   │    │ Redis        │     │ S3 / Cloud       │
│ - Users      │    │ - Sessions   │     │ Storage          │
│ - Wallets    │    │ - Game State │     │ - QR Codes       │
│ - Games      │    │ - Pub/Sub    │     │ - KYC Docs       │
│ - Bets       │    │ - Leaderboard│     │ - Avatars        │
│ - Rounds     │    │ - Cache      │     │                  │
│ - Txns       │    │              │     │                  │
└──────────────┘    └──────────────┘     └──────────────────┘
```

---

## Technology Stack

### Mobile App (Android)
| Layer          | Technology            | Justification                                    |
| -------------- | --------------------- | ------------------------------------------------ |
| Framework      | React Native          | Cross-platform ready, large community             |
| State Mgmt     | Zustand               | Lightweight, performant for real-time games       |
| Navigation     | React Navigation v6   | Industry standard for RN apps                    |
| Real-time      | Socket.IO Client      | Bi-directional communication for live games       |
| HTTP Client    | Axios                 | Interceptors, retry support                       |
| QR Scanner     | react-native-camera   | For deposit QR code scanning                      |
| 2FA            | OTP Input Library     | For TOTP code entry                               |
| Animations     | React Native Reanimated v3 | Smooth 60fps game animations                |
| Storage        | MMKV                  | Fast encrypted local storage                      |

### Backend
| Layer          | Technology            | Justification                                    |
| -------------- | --------------------- | ------------------------------------------------ |
| Runtime        | Node.js (v20 LTS)     | Async I/O, ideal for real-time apps               |
| Framework      | NestJS                | Modular, enterprise-grade, WebSocket support      |
| ORM            | Prisma                | Type-safe DB access, migrations                   |
| Database       | PostgreSQL 16         | ACID compliance for financial transactions        |
| Cache/PubSub   | Redis 7               | Game state, round timers, session management      |
| WebSocket      | Socket.IO (via NestJS)| Real-time game updates, bet confirmations         |
| Auth           | Passport.js + JWT     | Flexible strategies for email + 2FA               |
| 2FA            | Speakeasy (TOTP)      | TOTP-based two-factor authentication              |
| Task Scheduler | Bull (Redis-backed)   | Round scheduling, auto-settlement                 |
| File Storage   | AWS S3 / MinIO        | QR codes, user documents                          |
| API Docs       | Swagger (OpenAPI)     | Auto-generated API documentation                  |

### Admin Panel
| Layer          | Technology            | Justification                                    |
| -------------- | --------------------- | ------------------------------------------------ |
| Framework      | React 18 + Vite       | Fast builds, modern tooling                       |
| UI Library     | Ant Design Pro        | Enterprise-grade admin components                 |
| Charts         | Recharts              | Analytics visualization                           |
| State Mgmt     | React Query + Zustand | Server state + client state                       |
| Real-time      | Socket.IO Client      | Live game monitoring                              |

### DevOps & Infrastructure
| Layer          | Technology            | Justification                                    |
| -------------- | --------------------- | ------------------------------------------------ |
| Containerization | Docker + Docker Compose | Consistent dev/prod environments              |
| CI/CD          | GitHub Actions        | Automated testing & deployment                    |
| Cloud          | AWS (EC2, RDS, ElastiCache, S3) | Scalable infrastructure             |
| Monitoring     | Grafana + Prometheus  | Performance monitoring                            |
| Logging        | Winston + ELK Stack   | Centralized logging                               |

---

## Game Catalog

All games follow a **time-period (round) based** model:

| #  | Game            | Type         | Round Duration | Players/Room | Status     |
| -- | --------------- | ------------ | -------------- | ------------ | ---------- |
| 1  | Teen Patti      | Card Game    | 60-90 sec      | 2-7          | ✅ Defined |
| 2  | Aviator         | Crash Game   | 15-30 sec      | Unlimited    | ✅ Defined |
| 3  | 7 Up Down       | Dice Game    | 30-45 sec      | Unlimited    | ✅ Defined |
| 4  | Dragon & Tiger  | Card Game    | 25-30 sec      | Unlimited    | ✅ Defined |
| 5  | Poker           | Card Game    | 120-180 sec    | 2-9          | ✅ Defined |
| 6  | TBD             | —            | —              | —            | 🔲 Pending |
| 7  | TBD             | —            | —              | —            | 🔲 Pending |

---

## Core Modules

### 1. Authentication & User Module
- Email + Password signup/login
- 2FA via TOTP (Google Authenticator / Authy compatible)
- JWT-based session management
- Profile management (avatar, display name, phone)
- KYC verification (optional, admin-triggered)

### 2. Wallet & Transactions Module
- **Deposit:** QR code scanner-based (user scans admin-provided payment QR → submits screenshot/UTR → admin approves)
- **Withdrawal:** User requests → Admin verifies → Payout processed
- Transaction history with filters
- Real-time balance updates via WebSocket

### 3. Game Engine (Core)
- Abstract base game class with common round lifecycle
- Round lifecycle: `WAITING → BETTING → PLAYING → RESULT → SETTLEMENT`
- Time-based round scheduling via Bull queues
- Provably fair (optional) or admin-controlled outcomes
- Bet placement, validation, and settlement engine

### 4. Admin Panel
- **Game Controls:** Override game results, set win probabilities, configure round timers
- **Analytics:** Revenue, active users, game-wise P&L, bet volumes
- **Withdrawal Verification:** Approve/reject withdrawal requests
- **User Management:** View/ban/unban users, view wallet details
- **System Config:** Global settings, maintenance mode

---

## Non-Functional Requirements

| Requirement       | Target                                                    |
| ----------------- | --------------------------------------------------------- |
| Concurrent Users  | 10,000+ simultaneous connections                          |
| Latency           | < 200ms for game state updates                            |
| Uptime            | 99.9% availability                                        |
| Security          | OWASP Top 10 compliance, encrypted transactions           |
| Scalability       | Horizontal scaling via containerization                    |
| Data Retention    | 1 year transaction history, 3 months game history          |
| Compliance        | Terms of Service, Responsible Gaming policy                |

---

> **Next:** See `02-DATABASE-SCHEMA.md` for complete database design.
