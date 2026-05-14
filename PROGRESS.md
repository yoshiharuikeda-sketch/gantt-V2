# gantt-V2 開発進捗

## プロジェクト概要

次世代ガントチャート・工程管理アプリ。ベンダーRBAC（役割ベースアクセス制御）と版管理（Snapshot/Baseline）を独自機能として持つ。

**スタック:** Next.js 16.2.4 (App Router) / TypeScript / Tailwind CSS 4 / shadcn/ui / Supabase / Zustand / Lucide React

> `@dnd-kit` によるタスク並び替えドラッグは削除済み（2026-05-11）

---

## 開発ルール

- `as any` 禁止
- コメントは WHY が非自明な場合のみ
- Next.js のコードを書く前に `node_modules/next/dist/docs/` を確認すること（breaking changes あり）

---

## 実装済み機能

### 認証・基盤
- メール認証（登録・ログイン・ログアウト）
- 認証ガード（`src/middleware.ts`）
- QueryClientProvider / ReactQueryDevtools（`src/app/providers.tsx`）

### ダッシュボード
- プロジェクト一覧表示（`ProjectList.tsx`）
- 新規プロジェクト作成ダイアログ（`CreateProjectDialog.tsx`）
- サイドバー開閉（localStorage で状態保持）

### ガントチャート
- 左パネル（階層インデント・インライン編集・ベンダーBadge・列リサイズ）
- タイムライン（day/week/month ズーム切替）
- タスクバー（リサイズ、楽観的更新＋ロールバック）
- Baseline オーバーレイ表示（版との差分を半透明バーで表示）
- 版選択＋作成ダイアログ統合（`BaselineToggle.tsx`）
- フェーズ追加ダイアログ（`AddPhaseDialog.tsx`）
- タスク詳細モーダル（行クリックで開く、権限制御あり）
- 左パネル幅をドラッグで変更可能（200〜600px）
- 縦スクロール同期（左パネルとタイムライン）
- **行番号列の表示**（GanttLeftPanel / TaskSheet）— 36px 幅、ヘッダー `#`、表示専用（2026-05-11）
- **Page Up/Down のタイムライン同期**（GanttLeftPanel）— パネル高さ分スクロール、タイムライン側も同期（2026-05-11）

### Excelライクなセル操作（GanttLeftPanel / TaskSheet 共通）
- シングルクリックでセル選択（indigo リングでハイライト）
- ダブルクリックで編集モード開始
- 選択中に文字キー入力 → セル内容クリアして編集開始（押した文字が先頭に入る）
- F2 → 内容保持で編集開始
- Escape → 編集キャンセル、選択状態に戻る
- Enter → 確定して1行下に移動
- Tab / Shift+Tab → 確定して右/左に移動
- 矢印キー（選択中） → 上下左右にセル移動
- 他セルクリックで編集を保存して終了
- クリック＆ドラッグで複数セル範囲選択
- **Cmd+C** → 選択範囲をTSVコピー
- **Cmd+X** → 切り取り（name列除く）
- **Cmd+V** → 貼り付け（空白行へは新規タスク作成）
- **Delete** → 選択セルの内容クリア（name列除く）
- **Cmd+Delete** → タスク削除（確認ダイアログあり）
- 右クリック → コンテキストメニュー（タスク削除）
- **Cmd+Z** → Undo（サーバーにも反映）
- **Cmd+Shift+Z** → Redo（サーバーにも反映）
- 空白行をデフォルト表示（合計20行）、「+ 10行追加」ボタン
- 空白行へのダブルクリック入力で新規タスク作成
- **Shift+クリック／Shift+矢印キーで範囲選択拡張**（GanttLeftPanel / TaskSheet）— selectionAnchor / selectionHead state による矩形範囲拡張（2026-05-11）
- **選択範囲の Delete キーで一括クリア**（TaskSheet 新規実装、GanttLeftPanel は元から対応済み）— selectionRange 内の全セルをクリア（name列除く）、Undo 対応（2026-05-11）

### タスクシートビュー
- スプレッドシート形式（`TaskSheet.tsx`）
- ガント/シート切替ボタン（ProjectView に組み込み済み）
- RBAC 対応（ベンダーは担当タスクのみ編集可）

### ベンダー RBAC
- ロール: `owner` / `admin` / `editor` / `viewer` / `vendor`
- ベンダーは担当タスク（`vendor_id = 自分`）の進捗・日付変更・子タスク追加・削除が可能
- スコープ未設定ベンダーは全タスク閲覧不可
- `src/types/rbac.ts`（`computeVendorVisibleTaskIds`, `derivePermissions`, `canVendorEditTask`）

### プロジェクト設定（`ProjectSettings.tsx`）
- タブ構成: 基本情報 / メンバー管理 / ベンダー管理
- メンバー招待・ロール変更・削除
- ベンダーへのタスクスコープ割り当て

### 版管理（Snapshot/Baseline）
- スナップショット作成・削除・一覧（`src/app/(dashboard)/projects/[id]/snapshots/page.tsx`）
- Baseline 差分オーバーレイ（`useBaselineOverlay.ts`）

### リアルタイム同期
- `useRealtimeProject.ts`（tasks/phases テーブルを Supabase Realtime で購読）

### 通知
- `NotificationBell.tsx`（Header に組み込み）
- `src/app/api/notifications/route.ts`

### 更新申請ワークフロー
- `src/app/api/update-requests/route.ts`
- `UpdateRequestDialog.tsx` / `UpdateRequestList.tsx`（ProjectView に組み込み済み）

### API Routes（全エンドポイントに権限チェック済み）
- `GET/POST /api/projects`
- `GET/PATCH/DELETE /api/projects/[id]`
- `GET/POST/PATCH/DELETE /api/phases`
- `GET/POST/PATCH/DELETE /api/tasks`
- `POST /api/tasks/reorder`
- `GET/POST/PATCH/DELETE /api/members`
- `GET/POST /api/snapshots`
- `DELETE /api/snapshots/[id]`
- `GET /api/notifications`
- `GET/POST /api/update-requests`

### Supabase マイグレーション（`supabase/migrations/`）
- `001_initial_schema.sql` — 全テーブル定義
- `002_rls_policies.sql` — RLS ポリシー
- `003_functions.sql` — ヘルパー関数・トリガー
- `004_invite_member.sql` — invite_member 関数
- `005_vendor_rbac.sql` — vendor ロール・is_vendor_task_visible 関数
- `006_snapshots.sql` — snapshots テーブル・create_snapshot 関数

---

## 既知の未解決問題

- `GanttBar.tsx`: `resize-right` の最小幅チェックが非対称（幅ゼロのバーが作れる）
- `GanttBar.tsx`: `TooltipProvider` を各バーに配置しており、大量タスク時に多数の Provider インスタンスが生成される
- `ProjectSettings.tsx`: ロール変更エラー時のリバートが初期値に依存（長期セッションで古い状態にリバートする可能性）
- `GET /api/tasks`: `is_project_member` が vendor ロールを弾く可能性がある（RLS が補完しているため機能上の問題はないが、APIレイヤーで明示的に許可することを推奨）

---

## Git ブランチ構成

| ブランチ | 内容 |
|---------|------|
| `main` | 現在の開発ベースライン |
| `feature/ag-grid` | AG Grid Community への移行試験（中断・保留） |

> AG Grid Community は複数セル範囲選択・クリップボードが Enterprise 限定のため、カスタム実装に戻した（2026-05-11）

---

## ファイル構成（src/）

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── projects/[id]/
│   │       ├── page.tsx
│   │       ├── settings/page.tsx
│   │       └── snapshots/page.tsx
│   ├── api/
│   │   ├── members/route.ts
│   │   ├── notifications/route.ts
│   │   ├── phases/route.ts
│   │   ├── projects/route.ts
│   │   ├── projects/[id]/route.ts
│   │   ├── snapshots/route.ts
│   │   ├── snapshots/[id]/route.ts
│   │   ├── tasks/route.ts
│   │   ├── tasks/reorder/route.ts
│   │   └── update-requests/route.ts
│   ├── auth/callback/route.ts
│   ├── layout.tsx
│   ├── providers.tsx
│   └── globals.css
├── components/
│   ├── ui/                          # shadcn/ui + Header.tsx, NotificationBell.tsx
│   ├── layout/Sidebar.tsx
│   ├── dashboard/
│   │   ├── CreateProjectDialog.tsx
│   │   └── ProjectList.tsx
│   ├── project/
│   │   ├── ProjectView.tsx
│   │   └── ProjectSettings.tsx
│   ├── gantt/
│   │   ├── GanttChart.tsx
│   │   ├── GanttBar.tsx
│   │   ├── GanttHeader.tsx
│   │   ├── GanttLeftPanel.tsx
│   │   ├── BaselineToggle.tsx
│   │   ├── AddPhaseDialog.tsx
│   │   └── hooks/
│   │       ├── useGanttDrag.ts
│   │       └── useBaselineOverlay.ts
│   ├── snapshot/
│   │   ├── CreateSnapshotDialog.tsx
│   │   ├── SnapshotCard.tsx
│   │   └── SnapshotList.tsx
│   ├── vendor/
│   │   ├── VendorBadge.tsx
│   │   ├── VendorTaskAssignment.tsx
│   │   └── VendorMemberTaskScope.tsx
│   ├── sheet/TaskSheet.tsx
│   ├── task/TaskDetailModal.tsx
│   └── update-request/
│       ├── UpdateRequestDialog.tsx
│       └── UpdateRequestList.tsx
├── hooks/
│   ├── useSignOut.ts
│   ├── usePermissions.ts
│   ├── useVendorFilter.ts
│   ├── useRealtimeProject.ts
│   └── useUndoRedo.ts              # Undo/Redo コマンドパターン（新規）
├── lib/
│   ├── ganttUtils.ts
│   ├── utils.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── repositories/
│   │   ├── projectRepository.ts
│   │   ├── taskRepository.ts
│   │   └── snapshotRepository.ts
│   └── utils/
│       ├── cn.ts
│       ├── dateUtils.ts
│       └── taskTree.ts
├── store/
│   ├── taskStore.ts
│   ├── projectStore.ts
│   ├── snapshotStore.ts
│   ├── uiStore.ts
│   └── notificationStore.ts
├── types/
│   ├── database.ts
│   ├── index.ts
│   └── rbac.ts
└── proxy.ts
```
