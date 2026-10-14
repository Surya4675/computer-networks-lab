import unittest
import app as simulator

class NetworkSimulatorTests(unittest.TestCase):
    def setUp(self):
        self.client = simulator.app.test_client()
        self.client.post('/api/reset', json={})

    def test_ping_online_host_succeeds(self):
        response = self.client.post('/api/command', json={'command':'ping 192.168.1.11','source':'PC1'})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['ok'])
        self.assertIn('0% loss', data['output'])

    def test_ping_unknown_host_fails_clearly(self):
        response = self.client.post('/api/command', json={'command':'ping 192.168.1.222','source':'PC1'})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertFalse(data['ok'])
        self.assertIn('unreachable', data['output'].lower())

    def test_unknown_command_does_not_execute(self):
        response = self.client.post('/api/command', json={'command':'dir','source':'PC1'})
        data = response.get_json()
        self.assertFalse(data['ok'])
        self.assertIn('not supported', data['output'])

    def test_duplicate_ip_is_rejected(self):
        response = self.client.post('/api/device', json={'device':'PC2','field':'ip','value':'192.168.1.10'})
        self.assertEqual(response.status_code, 409)
        self.assertIn('already assigned', response.get_json()['message'])

    def test_server_toggle_changes_http_demo(self):
        self.client.post('/api/device', json={'device':'Server','field':'server_running','value':False})
        response = self.client.post('/api/command', json={'command':'curl http://server.local','source':'PC1'})
        self.assertFalse(response.get_json()['ok'])
        self.assertIn('stopped', response.get_json()['output'].lower())

    def test_protocol_scenario_returns_stages(self):
        response = self.client.post('/api/simulate', json={'scenario':'tcp'})
        data = response.get_json()
        self.assertTrue(data['ok'])
        self.assertEqual(len(data['events']), 3)

if __name__ == '__main__':
    unittest.main()
