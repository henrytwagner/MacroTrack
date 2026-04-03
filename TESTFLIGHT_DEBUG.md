# TestFlight Debug Context

## Goal
Archive and upload Dialed to TestFlight Internal Only.

## Current State
- **Signing mode**: Manual (Release config)
- **Provisioning profile**: "Dialed Provisioning Profile" (App Store, expires 2027/03/30)
  - App ID: `5R2SPS48JA.com.henrywagner.dialed` ✓
  - Certificate included: **Apple Distribution — HENRY THOMAS WAGNER** ✓
  - Capabilities: In-App Purchase only (SIWA removed) ✓
- **Distribution cert**: "Apple Distribution: HENRY THOMAS WAGNER" exists in keychain (created 3/30/26)
- **Team ID**: `5R2SPS48JA` (HENRY THOMAS WAGNER)
- **Bundle ID**: `com.henrywagner.dialed`

## Blocking Issue
In Xcode → Signing & Capabilities → Release tab:
- Provisioning Profile: "Dialed Provisioning Profile" ← selected correctly
- Signing Certificate: **None** ← stuck, cannot be changed in UI
- Status warning: "Doesn't include signing certificate 'Apple Development: HENRY THOMAS WAGNER (4AK4UC7633)'"

Xcode is looking for the **Development** cert (4AK4UC7633) but the profile contains the **Distribution** cert.
Root cause: `CODE_SIGN_IDENTITY` in the Release build config is either blank or set to "Apple Development",
so Xcode is matching against the wrong cert type.

## What We Know
- The profile is correct — it has the Distribution cert, which is what Archive needs
- The Signing Certificate dropdown in the UI is uneditable when a profile is selected in manual mode
- The fix is to set `CODE_SIGN_IDENTITY = "Apple Distribution"` in the Release build settings

## Fix To Try
In Xcode → Target → Build Settings → search "Code Signing Identity":
- Release row → set to **"Apple Distribution"** (not "Apple Development", not "iOS Distribution")

This tells Xcode to use the Distribution cert, which IS in the profile.

## Config State
- `Release.xcconfig`: `API_HOST = backend-production-f8937.up.railway.app`, `API_SCHEME = https`
- `Debug.xcconfig`: `API_HOST = 192.168.1.63:3000`, `API_SCHEME = http`
- Deployment target: iOS 17.0
- SIWA: removed from code and entitlements
- project.pbxproj Release config: `CODE_SIGN_STYLE = Manual`, `PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*] = "Dialed Provisioning Profile"`

## Completed Fixes (this session)
- Removed Sign In with Apple from AuthStore.swift + SignInView.swift (commented out, not deleted)
- Fixed `glassEffect` → `glassOrMaterial(in:)` with iOS 26 availability guard
- Fixed `onScrollGeometryChange` → `onScrollOffsetChange` with iOS 18 availability guard
- Fixed WSClient Swift 6 concurrency errors (Timer + sendPing closures)
- Added `glassOrMaterial` View extension to Color+Theme.swift
