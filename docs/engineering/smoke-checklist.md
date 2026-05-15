# FitMate AI Smoke Checklist

Run this checklist in Expo Go after meaningful mobile or backend changes.

## Setup

- Project root: `C:\Users\jiang\Projects\fitmate-ai`
- Backend: `http://127.0.0.1:8000`
- Expo: `exp://192.168.1.71:8081`
- Start Expo with cache clear when UI looks stale: `npx.cmd expo start --lan --port 8081 --clear`

## Authentication

- Login with an existing test account reaches the chat screen.
- New account registration reaches the chat screen.

## Chat And Food Cards

- Send a normal chat message and verify assistant response appears.
- Type a food text message such as `我吃了半碗米饭和鸡胸肉` and verify a food card appears.
- Tap `编辑内容`; verify the food editor page opens.
- Edit food name, calories, protein, carbs, fat, and detail text.
- Save edit; verify card values and status update.
- Tap `确认并写入`; verify Records tab opens and the food record is confirmed.
- Create another food card and tap `丢弃`; verify the card disappears and does not count toward records.

## Photo Food Flow

- Tap `+` then camera/photo library.
- Select a food image; verify analysis card appears.
- Confirm, edit, and discard paths behave like the text/manual food card.

## Records

- Verify `今日摄入` reflects confirmed food records.
- Edit a confirmed food record; verify nutrition summary changes.
- Delete a food record; verify it disappears and nutrition summary changes.
- Tap `体重打卡`; verify a form opens, save weight and notes, and record appears.
- Tap `心情日记`; verify mood, hunger, craving, and detail fields save into a record.
- Edit and delete weight/mood records.

## Settings And Profile

- Open subscription page; plan cards respond to taps.
- Open profile; edit and save profile values.
- Restore purchase action shows visible feedback.

