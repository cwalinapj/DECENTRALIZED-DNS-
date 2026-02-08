import React from 'react';
import { SafeAreaView, Text, View, Button } from 'react-native';

export default function App() {
  return (
    <SafeAreaView>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>DDNS Wallet</Text>
        <Text>DNS enforcer + resource controls</Text>
        <View style={{ marginTop: 12 }}>
          <Button title=Connect