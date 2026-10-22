import AuthenticationServices
import CryptoKit
import Foundation
import SwiftUI

enum Google {
    static let clientID = Bundle.main.object(forInfoDictionaryKey: "GoogleClientID") as? String ?? ""

    static func idToken(_ session: WebAuthenticationSession) async throws -> String {
        let scheme = clientID.split(separator: ".").reversed().joined(separator: ".")
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = Data((0..<32).map { _ in UInt8.random(in: 0...255) }).base64URL
        var auth = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        auth.queryItems = [
            .init(name: "client_id", value: clientID), .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"), .init(name: "scope", value: "openid profile"),
            .init(name: "code_challenge", value: Data(SHA256.hash(data: Data(verifier.utf8))).base64URL), .init(name: "code_challenge_method", value: "S256"),
        ]
        let callback = try await session.authenticate(using: auth.url!, callbackURLScheme: scheme)
        guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { throw URLError(.userCancelledAuthentication) }

        var r = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        r.httpMethod = "POST"
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "content-type")
        var form = URLComponents()
        form.queryItems = [.init(name: "code", value: code), .init(name: "client_id", value: clientID), .init(name: "redirect_uri", value: redirect),
                           .init(name: "grant_type", value: "authorization_code"), .init(name: "code_verifier", value: verifier)]
        r.httpBody = form.percentEncodedQuery?.data(using: .utf8)
        struct Token: Decodable { let id_token: String }
        return try JSONDecoder().decode(Token.self, from: try await URLSession.shared.data(for: r).0).id_token
    }
}

extension Data {
    var base64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
