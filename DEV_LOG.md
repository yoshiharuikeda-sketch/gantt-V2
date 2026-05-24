# 開発ログ

## プロジェクト概要

Next.js 16.2.4 + Supabase + Vercel で構築したガントチャートアプリ。

- **フロントエンド**: Next.js (App Router), React 18, Zustand, Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL + RLS)
- **デプロイ**: Vercel

---

## 直近の主要バグ修正（新しい順）

### EmptyRow（空白行）入力系バグ（2026-05-24）

空白行（画面下部の新規タスク入力用行）の入力挙動を大幅修正。スプレッドシート UI における IME + React フォーカス管理は難易度が高く、複数回の修正サイクルが発生した。

**修正内容:**

| 症状 | 原因 | 修正 |
|------|------|------|
| 日本語入力中のテキストが見えない | hidden input が `opacity:0` のままで IME 合成テキストが不可視 | `isComposing` state で `opacity:1 / background:white` に切り替え |
| 英数の直接入力で onChange が発火しない | `defaultValue=""` + `el.value=''` DOM 直接変更が React の value tracking を破壊 | `key={inputResetKey}` による再マウントに変更（非制御入力を維持） |
| 制御入力で日本語が壊れた | `value={hiddenValue}` の制御入力が React 再レンダリング時に IME バッファをリセット | 非制御入力 + key 再マウント方式に戻した |
| 1回目の選択では入力できない | `useEffect([isNameSelected])` はブール値なので再クリック時に発火しない | `useEffect([currentSelection])` に変更（`selectedEmptyRow` オブジェクトは毎回新参照） |
| Enter で選択が消える | `submitEmptyRow` が `setSelectedEmptyRow` を呼んでいなかった | 成功後に `setSelectedEmptyRow({rowIndex: 0, col: 'name'})` を呼ぶよう修正 |
| Enter 後に2個下にジャンプ | `nextIdx = editingEmptyRowIndex + 1` でタスク挿入後の視覚ズレが2行分に見えた | 常に `rowIndex: 0`（最初の空白行）に戻すよう変更 |
| 縦線が点滅する（透明な隠し input） | `opacity:0` でも Chrome/macOS は OS レベルでキャレットを描画する | `caretColor: 'transparent'` を追加 |
| 日本語入力中のテキストが大きく左寄り | `fontSize: inherit` が意図しないサイズを継承、`left:0` でセルのパディングを無視 | `fontSize: '0.75rem'`、`paddingLeft: '8px'` に変更 |
| isComposing が stuck になる | hidden input が unmount 前に `compositionEnd` が発火しないケース | `isNameSelected` が false になったときに `setIsComposing(false)` するエフェクトを追加 |

**技術的背景:**

- タスク行の hidden input（`hiddenInputMapRef`）は常時 DOM に存在し、長期間安定動作している
- EmptyRow の hidden input は条件付きレンダリングで、選択時のみ DOM に存在する
- この構造的な差が「WBS番号ある空白行（タスク行）では動く、ない空白行では動かない」という現象を生んでいた

---

### フェーズ化 / タスクに戻す（2026-05-24）

| 症状 | 原因 | 修正 |
|------|------|------|
| フェーズ化で行位置が変わる | `rows` useMemo がフェーズを先頭に、未分類を末尾に並べていた | `display_order` 順にインターリーブするアルゴリズムに変更 |
| タスクに戻す で PATCH 500 | `convertTaskToPhase` が PATCH レスポンスを捨てていたため store の version が古く、次の PATCH でバージョン不一致 | PATCH レスポンスを読み取り `upsertTask` で store を最新化 |
| 中間状態でちらつく | store 更新を非同期操作の前後でバラバラに呼んでいた | 全 PATCH 完了後にまとめて store 更新（React バッチ化） |
| フェーズ削除後に子タスクが残る | DB は `on delete set null`、store は手動更新が必要 | `deletePhaseById` で子タスクも store と DB から明示的に削除 |

---

### RLS・権限系（2026-05 以前）

- `is_project_member` RPC の再帰ループを修正（`SECURITY DEFINER` 関数で RLS バイパス）
- editor ロールが設定画面・招待機能にアクセスできるよう修正
- vendor ロールのタスク読み取り/書き込み範囲を正しく制限

---

## アーキテクチャメモ

### 主要ファイル

| ファイル | 役割 |
|---------|------|
| `src/components/gantt/GanttLeftPanel.tsx` | ガントチャート左パネル（タスク行・空白行・フェーズ管理） |
| `src/components/gantt/GanttChart.tsx` | ガントチャート全体（タイムライン・フェーズ変換） |
| `src/hooks/useUndoRedo.ts` | Undo/Redo スタック（Cmd+Z / Cmd+Shift+Z） |
| `src/store/taskStore.ts` | Zustand store（tasks, phases） |
| `src/app/api/tasks/route.ts` | タスク CRUD API |
| `src/app/api/phases/route.ts` | フェーズ CRUD API |
| `src/lib/repositories/taskRepository.ts` | DB アクセス層 |

### 重要な設計上の注意点

- **`reorderTasks` store action**: display_order をローカル更新するのみ。API 呼び出しは呼び出し元の責任
- **楽観的並行性制御**: tasks に `version` フィールド。PATCH 時に version チェック、不一致は 500（PGRST116）
- **display_order**: タスク全体でフラットな連番。フェーズの表示位置は最初の子タスクの display_order で決まる
- **EmptyRow vs タスク行**: EmptyRow は DB に存在しない UI スロット。POST で初めて実体化する

---

## 既知の残課題

- EmptyRow の `extraEmptyRows` カウンターが積み上がり続ける（ページリロードでリセット）
- タスク行への WBS 番号付き空白行（名前が空のタスク）と EmptyRow の挙動差が残る可能性
