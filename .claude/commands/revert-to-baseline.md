# revert-to-baseline

AG Grid 移行前のベースライン（main ブランチ）に戻す。

## 手順

1. 現在のブランチと変更状態を確認する（`git status`, `git branch`）
2. 未コミットの変更があれば警告してユーザーに確認を求める
3. `git checkout main` でベースラインに戻す
4. 現在の状態をユーザーに報告する

## 補足

- ベースラインは `main` ブランチの最初のコミット（`eca5cfa`）
- AG Grid の作業は `feature/ag-grid` ブランチに保存されているため、後から `git checkout feature/ag-grid` で再開できる
- `git checkout feature/ag-grid` で AG Grid 作業に戻ることも可能
