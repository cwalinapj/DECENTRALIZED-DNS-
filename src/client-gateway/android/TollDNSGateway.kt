import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class TollDNSGateway(private val resolverUrl: String) {
    fun resolve(queryName: String, queryType: String, voucherJson: String): String {
        val url = URL("$resolverUrl/v1/resolve")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true

        val payload = """{
            \"voucher\": $voucherJson,
            \"query\": {\"name\": \"$queryName\", \"type\": \"$queryType\", \"needsGateway\": true}
        }"""

        OutputStreamWriter(connection.outputStream).use { it.write(payload) }
        return connection.inputStream.bufferedReader().use { it.readText() }
    }
}
