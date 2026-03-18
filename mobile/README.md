# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## iOS notes (run:ios, Metro, Podfile)

- For daily development, use two terminals from the `mobile` folder:
  - **Terminal 1**: `npm run start:dev` (kills anything on port 8081, clears caches, starts Metro on 8081)
  - **Terminal 2**: `npx expo run:ios` (or `npx expo run:ios --device` for a physical device)
- If Metro ever asks `Use port 8082 instead?`, answer **No (n)** and run `npm run kill:8081` before starting Metro again. The iOS dev build always expects Metro on **8081**.
- If `pod install` fails with *\"Could not automatically select an Xcode project\"* because both `MacroTrack.xcodeproj` and `MacroTrack 2.xcodeproj` exist, add this line near the top of the Podfile's config section:

  ```ruby
  project 'MacroTrack 2.xcodeproj'
  ```

  The `ios/` folder is generated and gitignored, so you may need to re-apply this change after running `expo prebuild` or recreating the native iOS project.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
