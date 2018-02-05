#!/usr/bin/bash

bazel build //proto:proto_js && cp ../bazel-genfiles/proto/builder_pb.js src/
