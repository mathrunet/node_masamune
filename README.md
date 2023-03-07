<p align="center">
  <a href="https://mathru.net">
    <img width="240px" src="https://raw.githubusercontent.com/mathrunet/node_masamune/main/.github/images/icon.png" alt="Masamune logo" style="border-radius: 32px"s><br/>
  </a>
  <h1 align="center">Masamune Framework</h1>
</p>

<p align="center">
  <a href="https://twitter.com/mathru">
    <img src="https://img.shields.io/twitter/follow/mathru.svg?colorA=1da1f2&colorB=&label=Follow%20on%20Twitter&style=flat-square" alt="Follow on Twitter" />
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/mathru"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=mathru&button_colour=FF5F5F&font_colour=ffffff&font_family=Poppins&outline_colour=000000&coffee_colour=FFDD00" width="136" /></a>
</p>

---

[[YouTube]](https://www.youtube.com/c/mathrunetchannel) | [[Packages]](https://pub.dev/publishers/mathru.net/packages) | [[Twitter]](https://twitter.com/mathru) | [[LinkedIn]](https://www.linkedin.com/in/mathrunet/)

---

Just load the package in index.ts and pass the predefined data to the methods to implement the server side.

Also, [katana_functions_firebase](https://pub.dev/packages/katana_functions_firebase/score) can be used to execute server-side functions from methods defined on the client side, allowing for safe implementation.

# Installation

Install the following packages

```bash
npm install @mathrunet/masamune
```

# Implementation

Import the package as follows and pass the value of `exports` and the list of functions you wish to define to the `deploy` function.

```dart
import * as m from "@mathrunet/masamune";

// Define [m.Functions.xxxx] for the functions to be added to Functions.
// 
// Functionsに追加する機能を[m.Functions.xxxx]を定義してください。
m.deploy(
    exports,
    [
        // Function for PUSH Notification.
        m.Functions.send_notification,
    ],
);
```

Functions passed to deploy are deployed to Cloud Functions for Firebase.
