/* Native iOS shell for the web app in this repository.
   The web files are copied into the bundle at build time ("Bundle Web App"
   build phase) and served to a WKWebView over a local custom scheme, so the
   app works fully offline and keeps its data in the app's own container. */

import SwiftUI

@main
struct OnApp: App {
    var body: some Scene {
        WindowGroup {
            WebScreen()
                .ignoresSafeArea()
        }
    }
}
