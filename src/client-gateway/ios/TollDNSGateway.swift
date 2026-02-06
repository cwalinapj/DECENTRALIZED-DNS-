import Foundation

struct TollDNSGateway {
    let resolverURL: URL

    func resolve(queryName: String, queryType: String, voucher: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: resolverURL.appendingPathComponent("/v1/resolve"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "voucher": voucher,
            "query": [
                "name": queryName,
                "type": queryType,
                "needsGateway": true
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONSerialization.jsonObject(with: data)
        return response as? [String: Any] ?? [:]
    }
}
