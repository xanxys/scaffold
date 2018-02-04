

genrule(
    name = "proto_desc",
    srcs = ["builder.proto"],
    outs = ["builder.protodesc"],
    cmd = "protoc -o $(OUTS) $(SRCS)",
)

genrule(
    name = "proto_nanopb",
    srcs = [":proto_desc"],
    outs = ["builder.pb.h", "builder.pb.c"],
    cmd = "python nanopb/generator/nanopb_generator.py $(location :proto_desc)",
)